import { useState, useCallback } from 'react';
import ClickableWord from './ClickableWord';

function ScoreBadge({ score }) {
  if (score == null) return null;
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  return <span className={`text-xs font-medium ${color}`}>{score}/100</span>;
}

// Color a user word based on pronunciation score from Azure
function PronunciationWord({ word, pronScore }) {
  const colorClass = pronScore == null ? 'text-white'
    : pronScore >= 80 ? 'text-green-300'
    : pronScore >= 60 ? 'text-yellow-300'
    : 'text-red-300';

  return (
    <span className={`${colorClass} inline`}>
      {word}
    </span>
  );
}

export default function ChatBubble({ type, text, userWords, userPinyin, userEnglish, aiResponse, score, displayMode, onSpeak, onSpeakSlow, onShowCorrections, wordScores }) {
  const [activeWord, setActiveWord] = useState(null);

  const handleWordTap = useCallback((word) => {
    setActiveWord(word);
  }, []);

  if (type === 'user') {
    // Build a pronunciation score map from wordScores (Azure data)
    const pronMap = {};
    if (wordScores) {
      wordScores.forEach(ws => {
        pronMap[ws.word] = ws.accuracyScore;
      });
    }

    return (
      <div className="flex justify-end items-end gap-2 animate-fade-in">
        <div className="chat-bubble chat-bubble-user">
          <p className="text-white text-[15px] leading-relaxed">
            {userWords && userWords.length > 0 ? (
              userWords.map((w, i) => (
                <ClickableWord
                  key={i}
                  word={w}
                  isActive={activeWord === w}
                  onTap={handleWordTap}
                  displayMode={displayMode}
                  pronScore={pronMap[w.chinese]}
                />
              ))
            ) : wordScores && wordScores.length > 0 ? (
              // Fallback: show Azure words with pronunciation coloring
              wordScores.map((ws, i) => (
                <PronunciationWord key={i} word={ws.word} pronScore={ws.accuracyScore} />
              ))
            ) : userPinyin ? (
              <ruby>{text}<rt>{userPinyin}</rt></ruby>
            ) : (
              text
            )}
          </p>
          {displayMode >= 1 && !userWords?.length && userPinyin && (wordScores?.length > 0) && (
            <p className="text-emerald-200/80 text-xs mt-1">{userPinyin}</p>
          )}
          {userEnglish && (
            <p className="text-emerald-200/70 text-xs mt-1 italic">{userEnglish}</p>
          )}
          {score != null && (
            <div className="mt-1 text-right">
              <ScoreBadge score={score} />
            </div>
          )}
        </div>
        <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center shrink-0 text-xs text-white font-medium">
          你
        </div>
      </div>
    );
  }

  // AI bubble
  const words = aiResponse?.words;
  const hasCorrections = aiResponse?.corrections?.length > 0 || aiResponse?.new_vocabulary?.length > 0;

  return (
    <div className="flex justify-start items-end gap-2 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center shrink-0 text-xs text-white font-medium">
        林
      </div>
      <div className="chat-bubble chat-bubble-ai">
        <p className="text-slate-50 text-[15px] leading-relaxed">
          {words && words.length > 0 ? (
            words.map((w, i) => (
              <ClickableWord
                key={i}
                word={w}
                isActive={activeWord === w}
                onTap={handleWordTap}
                displayMode={displayMode}
              />
            ))
          ) : aiResponse?.response && aiResponse?.pinyin ? (
            <ruby>{aiResponse.response}<rt>{aiResponse.pinyin}</rt></ruby>
          ) : (
            aiResponse?.response || ''
          )}
        </p>
        {displayMode >= 2 && aiResponse?.english && (
          <p className="text-slate-400 text-xs mt-1.5 italic">{aiResponse.english}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          {onSpeak && (
            <button onClick={onSpeak} className="text-slate-500 hover:text-teal-400 text-xs cursor-pointer" title="Play">
              <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
            </button>
          )}
          {onSpeakSlow && (
            <button onClick={onSpeakSlow} className="text-slate-500 hover:text-teal-400 text-xs cursor-pointer" title="Slow replay">
              <svg className="w-3.5 h-3.5 inline mr-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
              <span className="text-[10px]">0.7x</span>
            </button>
          )}
          {hasCorrections && onShowCorrections && (
            <button onClick={onShowCorrections} className="text-slate-500 hover:text-teal-400 text-xs cursor-pointer">
              {aiResponse.corrections.length} correction{aiResponse.corrections.length !== 1 ? 's' : ''}
              {aiResponse.new_vocabulary?.length > 0 && ` · ${aiResponse.new_vocabulary.length} new`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
