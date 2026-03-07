import { useState, useEffect, useCallback, useRef } from 'react';
import useAzureSpeech from '../hooks/useAzureSpeech';
import useAzureTTS from '../hooks/useAzureTTS';
import useConversation from '../hooks/useConversation';
import CorrectionPanel from './CorrectionPanel';

// Display modes for AI text
const DISPLAY_MODES = ['chinese', 'chinese+pinyin', 'chinese+pinyin+english'];

function ScoreBadge({ score }) {
  if (score == null) return null;
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  return <span className={`text-sm font-medium ${color}`}>发音: {score}/100</span>;
}

export default function ConversationScreen({ topic = null, onBack = null }) {
  const { recognizedText, isListening, startListening, error: sttError, pronunciationData } = useAzureSpeech();
  const { speak, isSpeaking, error: ttsError } = useAzureTTS();
  const { sendMessage, aiResponse, isLoading, error: chatError, reset } = useConversation(
    topic?.prompt || null
  );

  const [userText, setUserText] = useState('');
  const [userScore, setUserScore] = useState(null);
  const [displayMode, setDisplayMode] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const processingRef = useRef(false);

  // Determine state
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

      if (pronunciationData) {
        setUserScore(pronunciationData.accuracyScore);
      }

      // Build message with pronunciation context if available
      let messageText = recognizedText;
      if (pronunciationData) {
        const lowScoreWords = pronunciationData.words
          .filter(w => w.accuracyScore < 60)
          .map(w => `${w.word} (${w.accuracyScore}/100)`)
          .join(', ');

        if (lowScoreWords) {
          messageText += `\n\n[PRONUNCIATION DATA: Overall accuracy: ${pronunciationData.accuracyScore}/100, Fluency: ${pronunciationData.fluencyScore}/100. Words with low scores: ${lowScoreWords}]`;
        }
      }

      sendMessage(messageText).then((response) => {
        processingRef.current = false;
        if (response?.response) {
          speak(response.response);
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

  const handleBack = useCallback(() => {
    reset();
    onBack?.();
  }, [reset, onBack]);

  const errorMsg = sttError || ttsError || chatError;

  return (
    <div className="h-dvh bg-slate-900 flex flex-col">
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
        {topic && (
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
            <div className="space-y-2">
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
          <div className="bg-slate-800/50 rounded-xl p-4 w-full max-w-md">
            <p className="text-slate-300 text-center">{userText}</p>
            {userScore != null && (
              <div className="text-center mt-2">
                <ScoreBadge score={userScore} />
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {errorMsg && (
          <p className="text-red-400 text-sm text-center max-w-md">{errorMsg}</p>
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
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer
            ${state === 'LISTENING'
              ? 'bg-red-500 scale-110'
              : state === 'PROCESSING'
              ? 'bg-slate-700'
              : state === 'SPEAKING'
              ? 'bg-slate-700'
              : 'bg-slate-700 hover:bg-slate-600 active:scale-95'
            }
            ${state !== 'IDLE' ? 'opacity-70 cursor-not-allowed' : ''}
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
