import { useState, useEffect, useCallback, useRef } from 'react';
import useAzureSpeech from '../hooks/useAzureSpeech';
import useAzureTTS from '../hooks/useAzureTTS';
import useConversation from '../hooks/useConversation';
import ChatBubble from './ChatBubble';
import CorrectionPanel from './CorrectionPanel';
import SessionSummary from './SessionSummary';
import { createSession, saveExchange, endSession, upsertWord, updateWordStats, recordMistakePattern, getVocabulary, getMistakePatterns } from '../utils/db';
import { formatVocabularyContext, formatLevelContext } from '../utils/claudePrompt';

const DISPLAY_MODES = ['chinese', 'chinese+pinyin', 'chinese+pinyin+english'];

export default function ConversationScreen({ topic = null, onBack = null }) {
  const isReview = topic?.prompt === '__review__';
  const isTeacher = topic?.prompt === '__teacher__';
  const [vocabContext, setVocabContext] = useState(null);
  const [levelContext, setLevelContext] = useState(null);
  const [vocabLoaded, setVocabLoaded] = useState(false);

  const mode = isTeacher ? 'teacher' : isReview ? 'review' : 'normal';

  const { recognizedText, turnId, interimText, isListening, startListening, stopListening, error: sttError, pronunciationData } = useAzureSpeech();
  const { speak, isSpeaking, error: ttsError } = useAzureTTS();
  const { sendMessage, aiResponse, isLoading, error: chatError, reset } = useConversation(
    (isReview || isTeacher) ? null : (topic?.prompt || null),
    vocabContext,
    mode,
    levelContext
  );

  const [chatHistory, setChatHistory] = useState([]);
  const [displayMode, setDisplayMode] = useState(1);
  const [hasStarted, setHasStarted] = useState(false);
  const [correctionsFor, setCorrectionsFor] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const processingRef = useRef(false);
  const lastProcessedTurnRef = useRef(0);
  const initRef = useRef(false);
  const sessionIdRef = useRef(null);
  const turnRef = useRef(0);
  const scoresRef = useRef({ accuracies: [], fluencies: [], corrections: [], newWords: [] });
  const bottomRef = useRef(null);

  const [errorToast, setErrorToast] = useState(null);

  // Auto-scroll to bottom when chat history changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory.length, isLoading]);

  // Screen wake lock
  useEffect(() => {
    let wakeLock = null;
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (e) { /* not critical */ }
    }
    requestWakeLock();
    return () => { wakeLock?.release(); };
  }, []);

  // Load vocabulary context on mount
  useEffect(() => {
    async function loadVocabContext() {
      try {
        const mistakeCount = isTeacher ? 10 : 5;
        const [known, learning, newWords, mistakes] = await Promise.all([
          getVocabulary('known'),
          getVocabulary('learning'),
          getVocabulary('new'),
          getMistakePatterns(mistakeCount)
        ]);

        if (isTeacher) {
          // Teacher mode: full vocab context + level context
          const context = formatVocabularyContext(
            known.slice(0, 50),
            learning.slice(0, 20),
            newWords.slice(0, 10),
            mistakes
          );
          setVocabContext(context);
          setLevelContext(formatLevelContext(known, learning, mistakes, null));
        } else if (isReview) {
          setVocabContext(formatVocabularyContext(known, learning, [], []));
        } else {
          setVocabContext(formatVocabularyContext(
            known.slice(0, 50),
            learning.slice(0, 20),
            newWords.slice(0, 10),
            mistakes
          ));
        }
      } catch (e) {
        console.warn('Could not load vocabulary context:', e);
      }
      setVocabLoaded(true);
    }
    loadVocabContext();
  }, [isReview, isTeacher]);

  // Create session on mount
  useEffect(() => {
    createSession(topic?.english || 'Open Conversation').then(id => {
      sessionIdRef.current = id;
    });
  }, [topic]);

  // For topic/review/teacher mode: AI speaks first (wait for vocab context)
  useEffect(() => {
    if ((topic?.prompt || isReview || isTeacher) && !initRef.current && vocabLoaded) {
      initRef.current = true;
      setHasStarted(true);
      sendMessage('Start the conversation. Greet me in character for this scenario.').then((response) => {
        if (response?.response) {
          speak(response.response);
          setChatHistory([{ userText: null, pronunciationScore: null, aiResponse: response }]);
        }
      });
    }
  }, [topic, sendMessage, speak, vocabLoaded, isReview, isTeacher]);

  const state = isListening ? 'LISTENING'
    : isLoading ? 'PROCESSING'
    : isSpeaking ? 'SPEAKING'
    : 'IDLE';

  // When speech is recognized, send to Claude with pronunciation data
  useEffect(() => {
    if (turnId > 0 && turnId !== lastProcessedTurnRef.current && recognizedText && !processingRef.current) {
      lastProcessedTurnRef.current = turnId;
      processingRef.current = true;
      setHasStarted(true);

      const currentText = recognizedText;
      const currentPronData = pronunciationData;
      let currentScore = null;

      if (currentPronData) {
        currentScore = currentPronData.accuracyScore;
        scoresRef.current.accuracies.push(currentPronData.accuracyScore);
        scoresRef.current.fluencies.push(currentPronData.fluencyScore);
      }

      // Add user bubble immediately
      setChatHistory(prev => [...prev, { userText: currentText, pronunciationScore: currentScore, wordScores: currentPronData?.words || null, aiResponse: null }]);

      let messageText = currentText;
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

        // Update the last entry with AI response
        setChatHistory(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          updated[lastIdx] = { ...updated[lastIdx], aiResponse: response };
          return updated;
        });

        // Persist exchange to Supabase
        turnRef.current += 1;
        const turn = turnRef.current;

        if (sessionIdRef.current) {
          saveExchange(sessionIdRef.current, turn, {
            text: currentText,
            pronunciationScore: currentPronData?.accuracyScore || null,
            fluencyScore: currentPronData?.fluencyScore || null,
            wordScores: currentPronData?.words || null
          }, response);
        }

        // Update word stats
        if (currentPronData?.words) {
          currentPronData.words.forEach(w => {
            updateWordStats(w.word, w.accuracyScore >= 60, w.accuracyScore);
          });
        }

        // Record corrections
        if (response?.corrections) {
          response.corrections.forEach(c => {
            scoresRef.current.corrections.push(c);
            recordMistakePattern(c.type, c.explanation, c.original, c.corrected);
          });
        }

        // Upsert new vocabulary with context sentence (skip in review mode)
        if (!isReview && response?.new_vocabulary) {
          response.new_vocabulary.forEach(v => {
            scoresRef.current.newWords.push(v);
            upsertWord(v.word, v.pinyin, v.english, 'conversation', v.context || null);
          });
        }
      }).catch(() => {
        processingRef.current = false;
      });
    }
  }, [turnId, recognizedText, pronunciationData, sendMessage, speak]);

  const handleMicDown = useCallback(() => {
    if (state !== 'IDLE') return;
    startListening();
  }, [state, startListening]);

  const handleMicUp = useCallback(() => {
    // Always call stopListening — it's safe as a no-op when not listening.
    // Avoids stale closure issues where state hasn't updated yet.
    stopListening();
  }, [stopListening]);

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

    const exchangesWithResponses = chatHistory.filter(e => e.aiResponse);
    if (exchangesWithResponses.length > 0) {
      setShowSummary(true);
    } else {
      reset();
      onBack?.();
    }
  }, [reset, onBack, chatHistory]);

  const handleSummaryDone = useCallback(async (summaryData) => {
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

  const errorMsg = sttError || ttsError || chatError;

  // Show error as dismissible toast
  useEffect(() => {
    if (errorMsg) {
      setErrorToast(errorMsg);
      const timer = setTimeout(() => setErrorToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  if (showSummary) {
    return (
      <SessionSummary
        exchanges={chatHistory.filter(e => e.userText && e.aiResponse)}
        onDone={() => handleSummaryDone(null)}
      />
    );
  }

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
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        {onBack && (
          <button onClick={handleBack} className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer">
            ← Back
          </button>
        )}
        <div className="flex-1 text-center">
          <button onClick={cycleDisplayMode} className="text-slate-500 text-xs cursor-pointer hover:text-slate-300">
            {DISPLAY_MODES[displayMode]}
          </button>
        </div>
        {hasStarted && state === 'IDLE' && (
          <button onClick={handleFinish} className="text-teal-400 hover:text-teal-300 text-sm font-medium cursor-pointer">
            Finish
          </button>
        )}
        {topic && !hasStarted && (
          <span className="text-slate-500 text-sm">{topic.chinese || topic.english}</span>
        )}
      </div>

      {/* Scrollable chat log */}
      <div className="flex-1 overflow-y-auto px-4 pt-10 pb-28 space-y-3">
        {chatHistory.length === 0 && !isLoading && (
          <div className="flex-1 flex items-center justify-center h-full">
            <p className="text-slate-500 text-center">Tap the mic to start speaking</p>
          </div>
        )}

        {chatHistory.map((entry, i) => (
          <div key={i} className="space-y-3">
            {entry.userText && (
              <ChatBubble
                type="user"
                text={entry.userText}
                userWords={entry.aiResponse?.user_words}
                userPinyin={entry.aiResponse?.user_pinyin}
                userEnglish={entry.aiResponse?.user_english}
                score={entry.pronunciationScore}
                wordScores={entry.wordScores}
                displayMode={displayMode}
              />
            )}
            {entry.aiResponse ? (
              <ChatBubble
                type="ai"
                aiResponse={entry.aiResponse}
                displayMode={displayMode}
                isTeacher={isTeacher}
                onSpeak={() => speak(entry.aiResponse.response)}
                onSpeakSlow={() => speak(entry.aiResponse.response, 0.7)}
                onShowCorrections={
                  (entry.aiResponse.corrections?.length > 0 || entry.aiResponse.new_vocabulary?.length > 0)
                    ? () => setCorrectionsFor(entry.aiResponse)
                    : undefined
                }
              />
            ) : (
              // Loading indicator for pending AI response
              <div className="flex justify-start items-end gap-2">
                <div className={`w-8 h-8 rounded-full ${isTeacher ? 'bg-amber-700' : 'bg-slate-600'} flex items-center justify-center shrink-0 text-xs text-white font-medium`}>
                  {isTeacher ? '王' : '林'}
                </div>
                <div className="chat-bubble chat-bubble-ai">
                  <div className="flex gap-1 py-1">
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Interim speech preview while holding mic */}
        {isListening && interimText && (
          <div className="flex justify-end">
            <div className="chat-bubble chat-bubble-user opacity-60 italic">
              {interimText}
            </div>
          </div>
        )}

        {/* Initial loading spinner for topic greeting */}
        {isLoading && chatHistory.length === 0 && (
          <div className="flex justify-start items-end gap-2">
            <div className={`w-8 h-8 rounded-full ${isTeacher ? 'bg-amber-700' : 'bg-slate-600'} flex items-center justify-center shrink-0 text-xs text-white font-medium`}>
              {isTeacher ? '王' : '林'}
            </div>
            <div className="chat-bubble chat-bubble-ai">
              <div className="flex gap-1 py-1">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Corrections panel */}
      {correctionsFor && (
        <CorrectionPanel
          corrections={correctionsFor.corrections || []}
          newVocabulary={correctionsFor.new_vocabulary || []}
          onClose={() => setCorrectionsFor(null)}
        />
      )}

      {/* Bottom bar: state indicator + mic */}
      <div className="shrink-0 flex flex-col items-center pb-8 pt-3 border-t border-slate-800">
        <div className="text-xs text-slate-500 mb-2 h-4">
          {state === 'LISTENING' && (interimText ? 'Listening...' : 'Hold to speak...')}
          {state === 'PROCESSING' && 'Thinking...'}
          {state === 'SPEAKING' && 'Speaking...'}
          {state === 'IDLE' && 'Hold to talk'}
        </div>
        <button
          onPointerDown={handleMicDown}
          onPointerUp={handleMicUp}
          onPointerLeave={handleMicUp}
          onContextMenu={(e) => e.preventDefault()}
          disabled={state === 'PROCESSING' || state === 'SPEAKING'}
          className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all cursor-pointer select-none touch-none
            ${state === 'LISTENING'
              ? 'bg-red-500 scale-110 mic-pulse'
              : state === 'PROCESSING'
              ? 'bg-slate-700'
              : state === 'SPEAKING'
              ? 'bg-slate-700'
              : 'bg-slate-700 hover:bg-slate-600 active:scale-95'
            }
            ${(state === 'PROCESSING' || state === 'SPEAKING') ? 'cursor-not-allowed' : ''}
          `}
        >
          {state === 'PROCESSING' ? (
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          ) : state === 'SPEAKING' ? (
            <svg className="w-6 h-6 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-slate-50" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
