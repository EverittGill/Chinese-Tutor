import { useState, useEffect, useRef, useCallback } from 'react';
import useAzureSpeech from '../hooks/useAzureSpeech';
import useAzureTTS from '../hooks/useAzureTTS';
import { getPronunciationSentences, savePronunciationAttempt } from '../utils/db';
import { generateSentenceFeedback } from '../utils/pronunciationFeedback';

const COLD_START_SENTENCES = [
  { chinese: '你好，我叫小明。', pinyin: 'Nǐ hǎo, wǒ jiào Xiǎo Míng.', english: 'Hello, my name is Xiao Ming.' },
  { chinese: '今天天气很好。', pinyin: 'Jīntiān tiānqì hěn hǎo.', english: 'The weather is great today.' },
  { chinese: '我想喝一杯咖啡。', pinyin: 'Wǒ xiǎng hē yī bēi kāfēi.', english: 'I want to drink a cup of coffee.' },
  { chinese: '请问，这个多少钱？', pinyin: 'Qǐngwèn, zhège duōshao qián?', english: 'Excuse me, how much is this?' },
  { chinese: '我喜欢吃中国菜。', pinyin: 'Wǒ xǐhuān chī Zhōngguó cài.', english: 'I like eating Chinese food.' },
  { chinese: '你会说英语吗？', pinyin: 'Nǐ huì shuō Yīngyǔ ma?', english: 'Can you speak English?' },
  { chinese: '我住在北京。', pinyin: 'Wǒ zhù zài Běijīng.', english: 'I live in Beijing.' },
  { chinese: '现在几点了？', pinyin: 'Xiànzài jǐ diǎn le?', english: 'What time is it now?' },
  { chinese: '谢谢你的帮助。', pinyin: 'Xièxie nǐ de bāngzhù.', english: 'Thank you for your help.' },
  { chinese: '我每天早上跑步。', pinyin: 'Wǒ měitiān zǎoshang pǎobù.', english: 'I run every morning.' },
];

// States: LOADING, LISTEN, RECORD, COMPARE, DONE
export default function PronunciationScreen({ onBack }) {
  const [phase, setPhase] = useState('LOADING');
  const [sentences, setSentences] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isRetry, setIsRetry] = useState(false);
  const [expandedWord, setExpandedWord] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [attemptScores, setAttemptScores] = useState([]);

  const { turnId, interimText, isListening, startListening, stopListening, error: sttError, pronunciationData } = useAzureSpeech();
  const { speak, isSpeaking } = useAzureTTS();
  const lastProcessedTurnRef = useRef(0);

  const currentSentence = sentences[currentIdx] || null;

  // Load sentences
  useEffect(() => {
    async function load() {
      const fetched = await getPronunciationSentences(15);
      if (fetched && fetched.length > 0) {
        setSentences(fetched);
      } else {
        setSentences(COLD_START_SENTENCES);
      }
      setPhase('LISTEN');
    }
    load();
  }, []);

  // Auto-play TTS when entering LISTEN phase
  useEffect(() => {
    if (phase === 'LISTEN' && currentSentence) {
      const rate = isRetry ? 1.0 : 0.7;
      speak(currentSentence.chinese, rate);
    }
  }, [phase, currentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Process recognition result — uses same pattern as ConversationScreen
  useEffect(() => {
    if (turnId > 0 && turnId !== lastProcessedTurnRef.current && pronunciationData) {
      lastProcessedTurnRef.current = turnId;

      const sentenceFeedback = generateSentenceFeedback(pronunciationData);
      setFeedback(sentenceFeedback); // eslint-disable-line react-hooks/set-state-in-effect
      setAttemptScores(prev => [...prev, sentenceFeedback.overallScore]);
      setPhase('COMPARE');

      if (currentSentence) {
        savePronunciationAttempt(
          currentSentence.chinese,
          currentSentence.pinyin,
          {
            accuracy: pronunciationData.accuracyScore,
            fluency: pronunciationData.fluencyScore,
            completeness: pronunciationData.completenessScore,
            overall: sentenceFeedback.overallScore
          },
          pronunciationData.words
        );
      }
    }
  }, [turnId, pronunciationData, currentSentence]);

  const handleMicDown = useCallback(() => {
    startListening(currentSentence?.chinese || '');
  }, [startListening, currentSentence]);

  const handleMicUp = useCallback(() => {
    stopListening();
  }, [stopListening]);

  const handleReadyToRecord = () => {
    setPhase('RECORD');
    setExpandedWord(null);
    setFeedback(null);
  };

  const handleTryAgain = () => {
    setIsRetry(true);
    setPhase('LISTEN');
  };

  const handleNext = () => {
    if (currentIdx + 1 >= sentences.length) {
      setPhase('DONE');
    } else {
      setCurrentIdx(prev => prev + 1);
      setIsRetry(false);
      setExpandedWord(null);
      setFeedback(null);
      setPhase('LISTEN');
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-green-50 border-green-200';
    if (score >= 60) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  // LOADING
  if (phase === 'LOADING') {
    return (
      <div className="min-h-dvh bg-warm-50 flex items-center justify-center">
        <p className="text-warm-600 animate-pulse">Loading sentences...</p>
      </div>
    );
  }

  // DONE
  if (phase === 'DONE') {
    const avgScore = attemptScores.length > 0
      ? Math.round(attemptScores.reduce((a, b) => a + b, 0) / attemptScores.length)
      : 0;

    return (
      <div className="min-h-dvh bg-warm-50 p-6">
        <div className="max-w-md mx-auto space-y-6 pt-12">
          <div className="text-center space-y-4">
            <div className="text-5xl">
              {avgScore >= 80 ? '🎉' : avgScore >= 60 ? '💪' : '📚'}
            </div>
            <h2 className="text-2xl font-bold text-warm-900">Practice Complete</h2>
            <div className="bg-warm-100 rounded-2xl p-6 space-y-3 shadow-soft">
              <div className="text-sm text-warm-600">Sentences Practiced</div>
              <div className="text-3xl font-bold text-warm-900">{attemptScores.length}</div>
              <div className="text-sm text-warm-600 mt-4">Average Score</div>
              <div className={`text-3xl font-bold ${getScoreColor(avgScore)}`}>{avgScore}/100</div>
            </div>
            <p className="text-warm-600 text-sm">
              {avgScore >= 80
                ? 'Great work! Your pronunciation is getting really good.'
                : avgScore >= 60
                ? 'Good progress! Keep practicing the tricky sounds.'
                : 'Practice makes perfect — try again with slow playback!'}
            </p>
          </div>
          <button
            onClick={onBack}
            className="w-full bg-warm-200 hover:bg-warm-300 text-warm-900 rounded-xl p-4 transition-colors"
          >
            Back to Topics
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-warm-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-warm-600 hover:text-warm-900 text-sm">
            ← Back
          </button>
          <span className="text-sm text-warm-500">
            {currentIdx + 1} / {sentences.length}
          </span>
        </div>

        {/* Target Sentence Card */}
        {currentSentence && (
          <div className={`bg-warm-100 rounded-2xl p-5 space-y-2 shadow-soft ${phase === 'COMPARE' ? 'opacity-60' : ''}`}>
            <RubyText chinese={currentSentence.chinese} pinyin={currentSentence.pinyin} />
            {currentSentence.english && (
              <div className="text-sm text-warm-500">{currentSentence.english}</div>
            )}
          </div>
        )}

        {/* LISTEN phase */}
        {phase === 'LISTEN' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                onClick={() => currentSentence && speak(currentSentence.chinese, 0.7)}
                disabled={isSpeaking}
                className="flex-1 bg-warm-200 hover:bg-warm-300 disabled:opacity-50 text-warm-900 rounded-xl p-3 text-sm transition-colors"
              >
                🔊 Listen Again (slow)
              </button>
              <button
                onClick={() => currentSentence && speak(currentSentence.chinese, 1.0)}
                disabled={isSpeaking}
                className="flex-1 bg-warm-200 hover:bg-warm-300 disabled:opacity-50 text-warm-900 rounded-xl p-3 text-sm transition-colors"
              >
                🔊 Normal Speed
              </button>
            </div>
            <button
              onClick={handleReadyToRecord}
              disabled={isSpeaking}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl p-4 font-medium transition-colors"
            >
              Ready to Record
            </button>
          </div>
        )}

        {/* RECORD phase */}
        {phase === 'RECORD' && (
          <div className="space-y-4">
            {interimText && (
              <div className="bg-warm-100 rounded-xl p-3 text-sm text-warm-700 min-h-[2.5rem]">
                {interimText}
              </div>
            )}
            <button
              onPointerDown={handleMicDown}
              onPointerUp={handleMicUp}
              onPointerLeave={handleMicUp}
              className={`w-full rounded-xl p-6 font-medium transition-all select-none touch-none ${
                isListening
                  ? 'bg-red-600 text-white scale-[1.02]'
                  : 'bg-brand-600 hover:bg-brand-700 text-white'
              }`}
            >
              {isListening ? '🎙️ Recording... Release to stop' : '🎙️ Hold to Record'}
            </button>
            {sttError && (
              <p className="text-red-600 text-sm text-center">{sttError}</p>
            )}
          </div>
        )}

        {/* COMPARE phase */}
        {phase === 'COMPARE' && pronunciationData && feedback && (
          <div className="space-y-4">
            {/* User's attempt with word coloring */}
            <div className="bg-warm-100 rounded-2xl p-4 space-y-3 shadow-soft">
              <div className="text-xs text-warm-500 uppercase tracking-wide">Your Pronunciation</div>
              <div className="flex flex-wrap gap-1.5">
                {pronunciationData.words.map((w, i) => (
                  <button
                    key={i}
                    onClick={() => setExpandedWord(expandedWord === i ? null : i)}
                    className={`px-2 py-1 rounded-lg border text-base transition-colors ${getScoreBg(w.accuracyScore)} ${
                      expandedWord === i ? 'ring-2 ring-brand-500' : ''
                    }`}
                    style={{ fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' }}
                  >
                    <span className={getScoreColor(w.accuracyScore)}>{w.word}</span>
                    <span className="text-xs text-warm-500 ml-1">{w.accuracyScore}</span>
                  </button>
                ))}
              </div>

              {/* Expanded word detail */}
              {expandedWord !== null && pronunciationData.words[expandedWord] && (
                <WordDrilldown
                  wordData={pronunciationData.words[expandedWord]}
                  feedbackItem={feedback.feedbackItems.find(f => f.word === pronunciationData.words[expandedWord].word)}
                  onSpeak={(text) => speak(text)}
                  getScoreColor={getScoreColor}
                />
              )}
            </div>

            {/* Overall scores */}
            <div className="grid grid-cols-3 gap-2">
              <ScoreBox label="Accuracy" score={pronunciationData.accuracyScore} getScoreColor={getScoreColor} />
              <ScoreBox label="Fluency" score={pronunciationData.fluencyScore} getScoreColor={getScoreColor} />
              <ScoreBox label="Completeness" score={pronunciationData.completenessScore} getScoreColor={getScoreColor} />
            </div>

            {/* Feedback summary */}
            <div className="bg-warm-100 rounded-xl p-4 space-y-2 shadow-soft">
              <p className="text-sm text-warm-700">{feedback.summary}</p>
              {feedback.feedbackItems.filter(f => f.feedback).slice(0, 3).map((item, i) => (
                <div key={i} className={`text-sm p-2 rounded-lg ${
                  item.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  <span className="font-medium">{item.word}</span>
                  {item.pinyin && <span className="text-warm-500 ml-1">({item.pinyin})</span>}
                  <span className="mx-1">—</span>
                  {item.feedback}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleTryAgain}
                className="flex-1 bg-warm-200 hover:bg-warm-300 text-warm-900 rounded-xl p-3 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={handleNext}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-xl p-3 font-medium transition-colors"
              >
                {currentIdx + 1 >= sentences.length ? 'Finish' : 'Next →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBox({ label, score, getScoreColor }) {
  return (
    <div className="bg-warm-100 rounded-xl p-3 text-center shadow-soft">
      <div className="text-xs text-warm-500">{label}</div>
      <div className={`text-xl font-bold ${getScoreColor(score)}`}>{score}</div>
    </div>
  );
}

// Splits Chinese characters and pinyin syllables, pairs them with <ruby> tags
function RubyText({ chinese, pinyin }) {
  if (!chinese) return null;
  if (!pinyin) {
    return (
      <div className="text-xl text-warm-900 font-medium" style={{ fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' }}>
        {chinese}
      </div>
    );
  }

  // Split pinyin into syllables (space-separated, handle punctuation attached to syllables)
  const pinyinParts = pinyin.match(/[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+[1-4]?/gi) || [];

  // Extract Chinese characters (skip punctuation for pairing)
  const chars = [];
  for (const ch of chinese) {
    // CJK Unified Ideographs range
    if (ch.charCodeAt(0) >= 0x4e00 && ch.charCodeAt(0) <= 0x9fff) {
      chars.push({ char: ch, isChinese: true });
    } else {
      chars.push({ char: ch, isChinese: false });
    }
  }

  let pinyinIdx = 0;
  const paired = chars.map((c) => {
    if (c.isChinese && pinyinIdx < pinyinParts.length) {
      return { char: c.char, pinyin: pinyinParts[pinyinIdx++] };
    }
    return { char: c.char, pinyin: null };
  });

  return (
    <div className="text-xl text-warm-900 font-medium leading-relaxed" style={{ fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif', lineHeight: '2.5' }}>
      {paired.map((p, i) =>
        p.pinyin ? (
          <ruby key={i} style={{ marginRight: '0.15em' }}>
            {p.char}
            <rp>(</rp><rt className="text-brand-600 text-xs font-normal">{p.pinyin}</rt><rp>)</rp>
          </ruby>
        ) : (
          <span key={i}>{p.char}</span>
        )
      )}
    </div>
  );
}

function WordDrilldown({ wordData, feedbackItem, onSpeak, getScoreColor }) {
  return (
    <div className="bg-warm-200/50 rounded-xl p-3 space-y-2 mt-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-lg text-warm-900" style={{ fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' }}>
            {wordData.word}
          </span>
          <span className={`ml-2 text-sm font-medium ${getScoreColor(wordData.accuracyScore)}`}>
            {wordData.accuracyScore}/100
          </span>
        </div>
        <button
          onClick={() => onSpeak(wordData.word)}
          className="bg-warm-300 hover:bg-warm-400 rounded-lg px-3 py-1.5 text-sm transition-colors"
        >
          🔊
        </button>
      </div>

      {/* Syllable scores */}
      {wordData.syllables && wordData.syllables.length > 0 && (
        <div className="flex gap-3 text-sm">
          {wordData.syllables.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-warm-600">{s.syllable}:</span>
              <span className={getScoreColor(s.accuracyScore)}>{s.accuracyScore}</span>
            </div>
          ))}
        </div>
      )}

      {/* Feedback tip */}
      {feedbackItem?.feedback && (
        <div className="text-sm text-amber-700 bg-amber-50 rounded-lg p-2">
          💡 {feedbackItem.feedback}
        </div>
      )}
    </div>
  );
}
