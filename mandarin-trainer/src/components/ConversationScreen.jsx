import { useState, useEffect, useCallback, useRef } from 'react';
import useAzureSpeech from '../hooks/useAzureSpeech';
import useAzureTTS from '../hooks/useAzureTTS';
import useConversation from '../hooks/useConversation';
import CorrectionPanel from './CorrectionPanel';
import SessionSummary from './SessionSummary';
import { createSession, saveExchange, endSession, upsertWord, updateWordStats, recordMistakePattern, getVocabulary, getMistakePatterns } from '../utils/db';
import { formatVocabularyContext } from '../utils/claudePrompt';

const DISPLAY_MODES = ['chinese', 'chinese+pinyin', 'chinese+pinyin+english'];

function ScoreBadge({ score }) {
  if (score == null) return null;
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  return <span className={`text-sm font-medium ${color}`}>发音: {score}/100</span>;
}

export default function ConversationScreen({ topic = null, onBack = null }) {
  const [vocabContext, setVocabContext] = useState(null);
  const [vocabLoaded, setVocabLoaded] = useState(false);

  const { recognizedText, isListening, startListening, error: sttError, pronunciationData } = useAzureSpeech();
  const { speak, isSpeaking, error: ttsError } = useAzureTTS();
  const { sendMessage, aiResponse, isLoading, error: chatError, reset } = useConversation(
    topic?.prompt || null,
    vocabContext
  );

  const [userText, setUserText] = useState('');
  const [userScore, setUserScore] = useState(null);
  const [displayMode, setDisplayMode] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const processingRef = useRef(false);
  const initRef = useRef(false);
  const sessionIdRef = useRef(null);
  const turnRef = useRef(0);
  const exchangeLogRef = useRef([]);
  const scoresRef = useRef({ accuracies: [], fluencies: [], corrections: [], newWords: [] });

  const [errorToast, setErrorToast] = useState(null);

  // Screen wake lock
  useEffect(() => {
    let wakeLock = null;
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (e) {
        // Wake lock not supported or denied — not critical
      }
    }
    requestWakeLock();
    return () => { wakeLock?.release(); };
  }, []);

  // Load vocabulary context on mount
  useEffect(() => {
    async function loadVocabContext() {
      try {
        const [known, learning, newWords, mistakes] = await Promise.all([
          getVocabulary('known'),
          getVocabulary('learning'),
          getVocabulary('new'),
          getMistakePatterns(5)
        ]);
        const context = formatVocabularyContext(
          known.slice(0, 50),
          learning.slice(0, 20),
          newWords.slice(0, 10),
          mistakes
        );
        setVocabContext(context);
      } catch (e) {
        console.warn('Could not load vocabulary context:', e);
      }
      setVocabLoaded(true);
    }
    loadVocabContext();
  }, []);

  // Create session on mount
  useEffect(() => {
    createSession(topic?.english || 'Open Conversation').then(id => {
      sessionIdRef.current = id;
    });
  }, [topic]);

  // For topic mode: AI speaks first (wait for vocab context)
  useEffect(() => {
    if (topic?.prompt && !initRef.current && vocabLoaded) {
      initRef.current = true;
      setHasStarted(true);
      sendMessage('Start the conversation. Greet me in character for this scenario.').then((response) => {
        if (response?.response) {
          speak(response.response);
        }
      });
    }
  }, [topic, sendMessage, speak, vocabLoaded]);

  const state = isListening ? 'LISTENING'
    : isLoading ? 'PROCESSING'
    : isSpeaking ? 'SPEAKING'
    : 'IDLE';

  // When speech is recognized, send to Claude with pronunciation data
  useEffect(() => {
    if (recognizedText && !processingRef.current) {
      processingRef.current = true;
      setUserText(recognizedText);
      setHasStarted(true);

      const currentPronData = pronunciationData;
      if (currentPronData) {
        setUserScore(currentPronData.accuracyScore);
        scoresRef.current.accuracies.push(currentPronData.accuracyScore);
        scoresRef.current.fluencies.push(currentPronData.fluencyScore);
      }

      let messageText = recognizedText;
      if (currentPronData) {
        const lowScoreWords = currentPronData.words
          .filter(w => w.accuracyScore < 60)
          .map(w => `${w.word} (${w.accuracyScore}/100)`)
          .join(', ');
        if (lowScoreWords) {
          messageText += `\n\n[PRONUNCIATION DATA: Overall accuracy: ${currentPronData.accuracyScore}/100, Fluency: ${currentPronData.fluencyScore}/100. Words with low scores: ${lowScoreWords}]`;
        }
      }

      sendMessage(messageText).then((response) => {
        processingRef.current = false;
        if (response?.response) {
          speak(response.response);
        }

        // Persist exchange to Supabase
        turnRef.current += 1;
        const turn = turnRef.current;

        exchangeLogRef.current.push({
          userText: recognizedText,
          pronunciationScore: currentPronData?.accuracyScore,
          aiResponse: response
        });

        if (sessionIdRef.current) {
          saveExchange(sessionIdRef.current, turn, {
            text: recognizedText,
            pronunciationScore: currentPronData?.accuracyScore || null,
            fluencyScore: currentPronData?.fluencyScore || null,
            wordScores: currentPronData?.words || null
          }, response);
        }

        // Update word stats for each word Azure recognized
        if (currentPronData?.words) {
          currentPronData.words.forEach(w => {
            updateWordStats(w.word, w.accuracyScore >= 60, w.accuracyScore);
          });
        }

        // Record corrections as mistake patterns
        if (response?.corrections) {
          response.corrections.forEach(c => {
            scoresRef.current.corrections.push(c);
            recordMistakePattern(c.type, c.explanation, c.original, c.corrected);
          });
        }

        // Upsert new vocabulary
        if (response?.new_vocabulary) {
          response.new_vocabulary.forEach(v => {
            scoresRef.current.newWords.push(v);
            upsertWord(v.word, v.pinyin, v.english, 'conversation');
          });
        }
      });
    }
  }, [recognizedText, pronunciationData, sendMessage, speak]);

  const handleMicTap = useCallback(() => {
    if (state !== 'IDLE') return;
    startListening();
  }, [state, startListening]);

  const handleReplay = useCallback(() => {
    if (aiResponse?.response && state === 'IDLE') {
      speak(aiResponse.response);
    }
  }, [aiResponse, state, speak]);

  const cycleDisplayMode = useCallback(() => {
    setDisplayMode(prev => (prev + 1) % DISPLAY_MODES.length);
  }, []);

  const handleFinish = useCallback(async () => {
    const accs = scoresRef.current.accuracies;
    const flus = scoresRef.current.fluencies;
    const avgAcc = accs.length > 0 ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null;
    const avgFlu = flus.length > 0 ? Math.round(flus.reduce((a, b) => a + b, 0) / flus.length) : null;

    if (sessionIdRef.current) {
      await endSession(sessionIdRef.current, {
        exchangeCount: turnRef.current,
        avgAccuracy: avgAcc,
        avgFluency: avgFlu,
        corrections: scoresRef.current.corrections,
        newWords: scoresRef.current.newWords
      });
    }

    if (exchangeLogRef.current.length > 0) {
      setShowSummary(true);
    } else {
      reset();
      onBack?.();
    }
  }, [reset, onBack]);

  const handleSummaryDone = useCallback(async (summaryData) => {
    // Update session with summary if we got one
    if (sessionIdRef.current && summaryData) {
      await endSession(sessionIdRef.current, {
        exchangeCount: turnRef.current,
        avgAccuracy: scoresRef.current.accuracies.length > 0
          ? Math.round(scoresRef.current.accuracies.reduce((a, b) => a + b, 0) / scoresRef.current.accuracies.length) : null,
        avgFluency: scoresRef.current.fluencies.length > 0
          ? Math.round(scoresRef.current.fluencies.reduce((a, b) => a + b, 0) / scoresRef.current.fluencies.length) : null,
        summary: summaryData,
        corrections: scoresRef.current.corrections,
        newWords: scoresRef.current.newWords
      });
    }
    reset();
    onBack?.();
  }, [reset, onBack]);

  const handleBack = useCallback(() => {
    reset();
    onBack?.();
  }, [reset, onBack]);

  if (showSummary) {
    return (
      <SessionSummary
        exchanges={exchangeLogRef.current}
        onDone={() => handleSummaryDone(null)}
      />
    );
  }

  const errorMsg = sttError || ttsError || chatError;

  // Show error as dismissible toast
  useEffect(() => {
    if (errorMsg) {
      setErrorToast(errorMsg);
      const timer = setTimeout(() => setErrorToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  return (
    <div className="h-dvh bg-slate-900 flex flex-col">
      {/* Error toast */}
      {errorToast && (
        <div className="absolute top-4 left-4 right-4 z-50 animate-toast">
          <div className="bg-red-900/90 text-red-200 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
            <span>{errorToast}</span>
            <button onClick={() => setErrorToast(null)} className="text-red-300 hover:text-red-100 ml-2 cursor-pointer">✕</button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        {onBack && (
          <button
            onClick={handleBack}
            className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer"
          >
            ← Back
          </button>
        )}
        <div className="flex-1" />
        {hasStarted && state === 'IDLE' && (
          <button
            onClick={handleFinish}
            className="text-teal-400 hover:text-teal-300 text-sm font-medium cursor-pointer"
          >
            Finish
          </button>
        )}
        {topic && !hasStarted && (
          <span className="text-slate-500 text-sm">{topic.chinese || topic.english}</span>
        )}
      </div>

      {/* AI Response Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 space-y-4">
        <div
          className="bg-slate-800 rounded-2xl p-6 w-full max-w-md min-h-[140px] flex flex-col justify-center cursor-pointer"
          onClick={cycleDisplayMode}
        >
          {!hasStarted && !aiResponse ? (
            <p className="text-center text-slate-400 text-lg">
              点击麦克风开始说话
            </p>
          ) : aiResponse ? (
            <div className="space-y-2 animate-fade-in">
              <p className="text-2xl text-slate-50 text-center leading-relaxed">
                {aiResponse.response}
              </p>
              {displayMode >= 1 && aiResponse.pinyin && (
                <p className="text-sm text-teal-400 text-center">
                  {aiResponse.pinyin}
                </p>
              )}
              {displayMode >= 2 && aiResponse.english && (
                <p className="text-sm text-slate-400 text-center italic">
                  {aiResponse.english}
                </p>
              )}
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Replay button */}
        {aiResponse && state === 'IDLE' && (
          <button
            onClick={handleReplay}
            className="text-slate-400 hover:text-teal-400 text-sm cursor-pointer"
          >
            🔁 Replay
          </button>
        )}

        {/* User text with pronunciation score */}
        {userText && (
          <div className="bg-slate-800/50 rounded-xl p-4 w-full max-w-md animate-fade-in">
            <p className="text-slate-300 text-center">{userText}</p>
            {userScore != null && (
              <div className="text-center mt-2">
                <ScoreBadge score={userScore} />
              </div>
            )}
          </div>
        )}

      </div>

      {/* Corrections badge */}
      {aiResponse && (aiResponse.corrections?.length > 0 || aiResponse.new_vocabulary?.length > 0) && (
        <div className="flex justify-center pb-2">
          <button
            onClick={() => setShowCorrections(true)}
            className="text-slate-400 hover:text-teal-400 text-sm cursor-pointer"
          >
            📝 {aiResponse.corrections.length} correction{aiResponse.corrections.length !== 1 ? 's' : ''}
            {aiResponse.new_vocabulary?.length > 0 && ` · ${aiResponse.new_vocabulary.length} new word`}
          </button>
        </div>
      )}

      {/* Corrections panel */}
      {showCorrections && aiResponse && (
        <CorrectionPanel
          corrections={aiResponse.corrections || []}
          newVocabulary={aiResponse.new_vocabulary || []}
          onClose={() => setShowCorrections(false)}
        />
      )}

      {/* Mic Button */}
      <div className="flex justify-center pb-12 pt-4">
        <button
          onClick={handleMicTap}
          disabled={state !== 'IDLE'}
          className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer
            ${state === 'LISTENING'
              ? 'bg-red-500 scale-110 mic-pulse'
              : state === 'PROCESSING'
              ? 'bg-slate-700'
              : state === 'SPEAKING'
              ? 'bg-slate-700'
              : 'bg-slate-700 hover:bg-slate-600 active:scale-95'
            }
            ${state !== 'IDLE' ? 'cursor-not-allowed' : ''}
          `}
        >
          {state === 'PROCESSING' ? (
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          ) : state === 'SPEAKING' ? (
            <svg className="w-8 h-8 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-slate-50" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
