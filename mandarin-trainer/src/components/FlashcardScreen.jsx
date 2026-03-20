/**
 * FlashcardScreen — FSRS-based spaced repetition review for Mandarin vocabulary.
 *
 * ## Two-Queue Architecture
 *
 * Cards are split into two queues instead of a single array with a linear index:
 *
 * - **reviewQueue**: Due cards fetched from the DB at session start, Fisher-Yates shuffled
 *   for interleaving benefit. Cards are pulled front-to-back.
 *
 * - **learningQueue**: Cards that were rated poorly (Again/Hard) and are due again within
 *   10 minutes. These re-enter the session on a timer rather than being appended to the
 *   end of the review queue. This prevents the problem where "Again" cards pile up at the
 *   tail and get reviewed in a predictable cluster.
 *
 * The `pickNextCard` function implements a priority system:
 *   1. Learning cards whose timer has expired (most urgent — short-interval recall)
 *   2. Review cards from the original shuffled queue
 *   3. If only learning cards remain but none are ready yet → show a countdown screen
 *   4. If both queues are empty → session complete, check DB for more due cards
 *
 * ## Card Modes
 *
 * - **Production**: English prompt shown → user speaks the Chinese word into the mic →
 *   Azure Speech SDK scores pronunciation → card auto-reveals with per-character color
 *   coding (green ≥80%, yellow ≥60%, red <60%). The pronunciation score also drives a
 *   suggested rating (highlighted button).
 *
 * - **Recognition**: Chinese characters/pinyin shown (configurable via displayMode) →
 *   user taps to reveal → English meaning + hidden info revealed. No speech scoring.
 *
 * ## Undo System
 *
 * After each rating, a 4-second undo toast appears. Undo reverts the DB write
 * (restores original FSRS fields), removes the card from the learning queue if it was
 * re-queued, pushes the current card back onto the review queue, and reinstates the
 * original card as current. This is critical because FSRS state changes are destructive —
 * a mis-tap on "Again" for a mature card would reset its stability to near-zero.
 *
 * ## Auto-Play TTS
 *
 * A header toggle cycles through three states: off → 0.7x (slow) → 1x (normal).
 * When enabled, TTS fires automatically on card reveal. The per-card speaker buttons
 * (normal + 0.7x) remain functional regardless of the toggle, so users can always
 * manually replay audio for a specific card.
 *
 * ## Batch Loading
 *
 * `getDueVocabulary(50)` loads at most 50 due cards per batch to keep memory usage
 * reasonable. When a batch is exhausted, the end screen checks for remaining due cards.
 * If more exist, a "Continue" button loads the next batch without losing the running
 * `reviewed` count.
 *
 * See: docs/flashcard-system.md for full system documentation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import { getDueVocabulary, updateFSRSCard, saveReviewLog, getSettings } from '../utils/db';
import useAzureSpeech from '../hooks/useAzureSpeech';
import useAzureTTS from '../hooks/useAzureTTS';

// FSRS instance with default parameters (0.9 retention target).
// Shared across all cards — stateless, so one instance is fine.
const f = fsrs(generatorParameters());

function ratingLabel(rating) {
  switch (rating) {
    case Rating.Again: return 'Again';
    case Rating.Hard: return 'Hard';
    case Rating.Good: return 'Good';
    case Rating.Easy: return 'Easy';
    default: return '';
  }
}

// Returns Tailwind classes for rating buttons. When `suggested` is true (based on
// pronunciation score), adds a ring + scale effect to visually recommend that rating.
function ratingColor(rating, suggested = false) {
  const base = (() => {
    switch (rating) {
      case Rating.Again: return 'bg-red-600 hover:bg-red-700';
      case Rating.Hard: return 'bg-orange-600 hover:bg-orange-700';
      case Rating.Good: return 'bg-brand-600 hover:bg-brand-700';
      case Rating.Easy: return 'bg-green-600 hover:bg-green-700';
      default: return 'bg-warm-400';
    }
  })();
  return suggested ? `${base} ring-2 ring-white ring-offset-2 ring-offset-warm-50 scale-105` : base;
}

// Formats the FSRS-predicted next review interval as a human-readable string (e.g. "1m", "4h", "3d").
// Shown beneath each rating button so the user knows the scheduling consequence of their choice.
function formatInterval(card) {
  if (!card?.due) return '';
  const now = new Date();
  const due = new Date(card.due);
  const diffMs = due - now;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `${Math.max(1, diffMin)}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d`;
}

// Pronunciation score → color. Thresholds match the conversation screen's coloring.
function pronColor(score) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-500';
}

// Maps a pronunciation score to a suggested FSRS rating. Returns null if no score
// is available (recognition mode or mic not used), so no button gets highlighted.
function suggestedRating(score) {
  if (score == null) return null;
  if (score >= 80) return Rating.Good;
  if (score >= 60) return Rating.Hard;
  return Rating.Again;
}

// Controls what's visible on the front of recognition-mode cards.
// 'characters_only' hides pinyin until reveal, 'pinyin_only' hides characters, 'both' shows everything.
const DISPLAY_MODES = ['characters_only', 'pinyin_only', 'both'];

export default function FlashcardScreen({ onBack }) {
  // --- Two-queue scheduling state ---
  const [reviewQueue, setReviewQueue] = useState([]);     // Shuffled due cards, pulled front-to-back
  const [learningQueue, setLearningQueue] = useState([]); // Re-queued cards on short-interval timers
  const [currentCard, setCurrentCard] = useState(null);   // The card currently being displayed
  const [waitingUntil, setWaitingUntil] = useState(null); // Timestamp when next learning card is due (null = not waiting)
  const [countdown, setCountdown] = useState(0);          // Seconds remaining on the waiting screen

  // --- Card interaction state ---
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);            // Running count for the entire session (persists across batches)

  // --- Display/mode settings ---
  const [displayMode, setDisplayMode] = useState('characters_only');
  const [cardMode, setCardMode] = useState('production'); // 'production' | 'recognition'
  const [ttsVoice, setTtsVoice] = useState(null);

  // --- Pronunciation scoring (production mode only) ---
  const [pronunciationScore, setPronunciationScore] = useState(null);
  const [wordScores, setWordScores] = useState(null);     // Per-character accuracy from Azure SDK

  // --- Undo system ---
  const [lastAction, setLastAction] = useState(null);     // { originalCard, rating } for the most recent rating
  const [showUndo, setShowUndo] = useState(false);

  // --- Batch continuation ---
  const [moreDueCount, setMoreDueCount] = useState(0);    // Cards remaining beyond current batch

  // --- Auto-play TTS: 'off' | 'slow' (0.7x) | 'on' (1x) ---
  const [autoPlayTTS, setAutoPlayTTS] = useState('off');

  const startTimeRef = useRef(null);         // Timestamp when card was revealed — used for review duration logging
  const lastProcessedTurnRef = useRef(0);    // Deduplicates speech recognition results (Azure SDK can fire multiple events per utterance)
  const undoTimerRef = useRef(null);         // Handle for the 4-second undo toast timeout

  const { recognizedText, turnId, interimText, isListening, startListening, stopListening, error: sttError, pronunciationData, ready: speechReady } = useAzureSpeech();
  const { speak, isSpeaking, error: ttsError } = useAzureTTS(ttsVoice);

  // --- Initial load: fetch due cards, shuffle, apply user settings ---
  useEffect(() => {
    Promise.all([getDueVocabulary(50), getSettings()]).then(([vocab, settings]) => {
      // Fisher-Yates shuffle — prevents predictable review order which causes
      // contextual priming (e.g. reviewing all food words in a row)
      const shuffled = [...vocab];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      if (shuffled.length > 0) {
        setCurrentCard(shuffled[0]);
        setReviewQueue(shuffled.slice(1));
      }
      if (settings.pinyin_display_mode && DISPLAY_MODES.includes(settings.pinyin_display_mode)) {
        setDisplayMode(settings.pinyin_display_mode);
      }
      if (settings.tts_voice) setTtsVoice(settings.tts_voice);
      setLoading(false);
    });
  }, []);

  // --- Card selection priority logic ---
  // Uses nested setState callbacks to read the latest queue state without stale closures.
  // This is intentional — pickNextCard can be called from rapid successive ratings.
  const pickNextCard = useCallback(() => {
    const now = Date.now();

    setLearningQueue(prevLearning => {
      // Priority 1: Learning cards whose short-interval timer has expired
      const readyLearning = prevLearning.filter(c => new Date(c.due_date).getTime() <= now);
      if (readyLearning.length > 0) {
        readyLearning.sort((a, b) => a.due_date.localeCompare(b.due_date));
        const next = readyLearning[0];
        const remaining = prevLearning.filter(c => c !== next);
        setCurrentCard(next);
        setWaitingUntil(null);
        return remaining;
      }

      // Priority 2: Next card from the shuffled review queue
      setReviewQueue(prevReview => {
        if (prevReview.length > 0) {
          const next = prevReview[0];
          setCurrentCard(next);
          setWaitingUntil(null);
          return prevReview.slice(1);
        }

        // Priority 3: Only learning cards remain — show countdown until nearest one is ready
        if (prevLearning.length > 0) {
          const nextDue = Math.min(...prevLearning.map(c => new Date(c.due_date).getTime()));
          setWaitingUntil(nextDue);
          setCurrentCard(null);
        } else {
          // Both queues empty — session complete.
          // Check DB for more due cards (could be cards beyond the 50-card batch limit,
          // or cards that became due during the session)
          setCurrentCard(null);
          setWaitingUntil(null);
          getDueVocabulary(50).then(more => setMoreDueCount(more.length));
        }

        return prevReview;
      });

      return prevLearning;
    });
  }, []);

  // --- Countdown timer for the waiting screen ---
  // Ticks every second while learning cards are on a timer. Auto-picks the next
  // card when the countdown reaches zero.
  useEffect(() => {
    if (!waitingUntil) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((waitingUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        pickNextCard();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [waitingUntil, pickNextCard]);

  // --- Process speech recognition results (production mode) ---
  // Azure SDK fires multiple events per utterance — `turnId` deduplicates them.
  // When a valid result arrives, extract per-word pronunciation scores and auto-reveal.
  useEffect(() => {
    if (turnId > 0 && turnId !== lastProcessedTurnRef.current && recognizedText) {
      lastProcessedTurnRef.current = turnId;

      if (pronunciationData) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPronunciationScore(pronunciationData.accuracyScore);
        setWordScores(pronunciationData.words || null);
      } else {
        setPronunciationScore(null);
        setWordScores(null);
      }

      startTimeRef.current = Date.now();
      setRevealed(true);
    }
  }, [turnId, recognizedText, pronunciationData]);

  const handleTryAgain = useCallback(() => {
    setRevealed(false);
    setPronunciationScore(null);
    setWordScores(null);
    lastProcessedTurnRef.current = 0;
  }, []);

  const handleReveal = useCallback(() => {
    if (isListening) return;
    startTimeRef.current = Date.now();
    setRevealed(true);
  }, [isListening]);

  // --- Auto-play TTS on reveal ---
  // Fires when `revealed` flips to true. Intentionally uses a minimal dep array —
  // we only want this to fire on the reveal transition, reading current values at that moment.
  useEffect(() => {
    if (revealed && autoPlayTTS !== 'off' && currentCard?.word) {
      speak(currentCard.word, autoPlayTTS === 'slow' ? 0.7 : undefined);
    }
  }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Rate the current card and advance ---
  const handleRate = useCallback(async (rating) => {
    if (!currentCard) return;
    const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;

    // Snapshot the card's pre-rating state so undo can fully revert
    const originalCard = { ...currentCard };

    // Hydrate an FSRS card object from our DB fields, then compute the new schedule.
    // `f.repeat()` returns all four possible outcomes (Again/Hard/Good/Easy) — we pick the one matching the user's choice.
    const fsrsCard = createEmptyCard();
    fsrsCard.difficulty = currentCard.difficulty || 0;
    fsrsCard.stability = currentCard.stability || 0;
    fsrsCard.reps = currentCard.reps || 0;
    fsrsCard.lapses = currentCard.lapses || 0;
    fsrsCard.state = currentCard.state || 0;
    if (currentCard.due_date) fsrsCard.due = new Date(currentCard.due_date);
    if (currentCard.last_reviewed) fsrsCard.last_review = new Date(currentCard.last_reviewed);

    const result = f.repeat(fsrsCard, new Date());
    const scheduled = result[rating];
    const newCard = scheduled.card;

    // actual_days = time since last review. Used by FSRS for retrievability calculation.
    const actualDays = currentCard.last_reviewed
      ? (Date.now() - new Date(currentCard.last_reviewed).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    // Persist the updated FSRS state and log the review
    await updateFSRSCard(currentCard.id, {
      difficulty: newCard.difficulty,
      stability: newCard.stability,
      retrievability: newCard.retrievability || 0,
      reps: newCard.reps,
      lapses: newCard.lapses,
      state: newCard.state,
      due_date: newCard.due.toISOString()
    });

    await saveReviewLog(
      currentCard.id,
      rating,
      durationMs,
      newCard.scheduled_days || 0,
      actualDays
    );

    // If the card is due again within 10 minutes (typical for Again/Hard on new cards),
    // add it to the learning queue so it re-appears after its short interval.
    // Cards due further out are "graduated" and won't show again this session.
    const msTilDue = newCard.due - Date.now();
    if (msTilDue < 10 * 60 * 1000) {
      const updatedCard = {
        ...currentCard,
        difficulty: newCard.difficulty,
        stability: newCard.stability,
        retrievability: newCard.retrievability || 0,
        reps: newCard.reps,
        lapses: newCard.lapses,
        state: newCard.state,
        due_date: newCard.due.toISOString(),
        last_reviewed: new Date().toISOString()
      };
      setLearningQueue(prev => [...prev, updatedCard]);
    }

    setReviewed(prev => prev + 1);
    setRevealed(false);
    setPronunciationScore(null);
    setWordScores(null);

    // Show undo toast for 4 seconds. Clears previous timer if user rates rapidly.
    setLastAction({ originalCard, rating });
    setShowUndo(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setShowUndo(false);
      setLastAction(null);
    }, 4000);

    pickNextCard();
  }, [currentCard, pickNextCard]);

  // --- Undo: revert DB state, re-queue cards, restore the original card ---
  const handleUndo = useCallback(async () => {
    if (!lastAction) return;
    const { originalCard } = lastAction;

    // Write back the original FSRS fields, erasing the rating we just saved
    await updateFSRSCard(originalCard.id, {
      difficulty: originalCard.difficulty,
      stability: originalCard.stability,
      retrievability: originalCard.retrievability || 0,
      reps: originalCard.reps,
      lapses: originalCard.lapses,
      state: originalCard.state,
      due_date: originalCard.due_date
    });

    // If the rated card was re-queued to the learning queue, remove it
    setLearningQueue(prev => prev.filter(c => c.id !== originalCard.id));

    // The card that was about to be shown next gets pushed back to the front of the review queue
    if (currentCard) {
      setReviewQueue(prev => [currentCard, ...prev]);
    }

    // Restore state as if the rating never happened
    setCurrentCard(originalCard);
    setWaitingUntil(null);
    setReviewed(prev => Math.max(0, prev - 1));
    setRevealed(false);
    setLastAction(null);
    setShowUndo(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [lastAction, currentCard]);

  // --- Load next batch of 50 due cards (called from the "Continue" button on end screen) ---
  const loadMoreCards = useCallback(() => {
    setLoading(true);
    setMoreDueCount(0);
    getDueVocabulary(50).then(vocab => {
      const shuffled = [...vocab];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      if (shuffled.length > 0) {
        setCurrentCard(shuffled[0]);
        setReviewQueue(shuffled.slice(1));
      }
      setLoading(false);
    });
  }, []);

  const handleMicDown = useCallback(() => {
    if (!speechReady || isListening || isSpeaking) return;
    startListening(currentCard?.word || '');
  }, [speechReady, isListening, isSpeaking, startListening, currentCard]);

  const handleMicUp = useCallback(() => {
    stopListening();
  }, [stopListening]);

  const errorMsg = sttError || ttsError;

  // ==================== RENDER ====================

  if (loading) {
    return (
      <div className="min-h-dvh bg-warm-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // --- Waiting screen: learning cards are on short-interval timers, none ready yet ---
  if (!currentCard && waitingUntil) {
    return (
      <div className="min-h-dvh bg-warm-50 flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <button onClick={onBack} className="text-warm-600 hover:text-warm-900 text-sm cursor-pointer">
            ← Back
          </button>
          <span className="text-warm-500 text-xs">
            {reviewed} done · {learningQueue.length} learning
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center space-y-4">
            <div className="text-6xl font-light text-warm-400">{countdown}s</div>
            <p className="text-warm-600 text-sm">
              {learningQueue.length} card{learningQueue.length !== 1 ? 's' : ''} coming back for review
            </p>
            <p className="text-warm-400 text-xs">Cards you marked for short-interval review are on a timer</p>
          </div>
        </div>
      </div>
    );
  }

  // --- End screen: batch complete or truly all done ---
  if (!currentCard && !waitingUntil && !loading) {
    return (
      <div className="min-h-dvh bg-warm-50 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="text-4xl">🎉</div>
          <h2 className="text-xl font-bold text-warm-900">
            {reviewed === 0 ? 'No cards due!' : moreDueCount > 0 ? 'Batch complete!' : 'All done!'}
          </h2>
          <p className="text-warm-600 text-sm">
            {reviewed > 0
              ? `Reviewed ${reviewed} card${reviewed !== 1 ? 's' : ''}`
              : 'Come back later for more reviews'}
          </p>
          {moreDueCount > 0 && (
            <p className="text-warm-700 text-sm font-medium">
              {moreDueCount} more card{moreDueCount !== 1 ? 's' : ''} due — continue if you'd like
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onBack}
              className={`${moreDueCount > 0 ? 'bg-warm-300 hover:bg-warm-400 text-warm-800' : 'bg-brand-600 hover:bg-brand-700 text-white'} font-medium rounded-lg px-6 py-2.5 transition-colors cursor-pointer`}
            >
              Back
            </button>
            {moreDueCount > 0 && (
              <button
                onClick={loadMoreCards}
                className="bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg px-6 py-2.5 transition-colors cursor-pointer"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Active review: compute preview intervals for all four rating buttons ---
  const fsrsCard = createEmptyCard();
  fsrsCard.difficulty = currentCard.difficulty || 0;
  fsrsCard.stability = currentCard.stability || 0;
  fsrsCard.reps = currentCard.reps || 0;
  fsrsCard.lapses = currentCard.lapses || 0;
  fsrsCard.state = currentCard.state || 0;
  if (currentCard.due_date) fsrsCard.due = new Date(currentCard.due_date);
  if (currentCard.last_reviewed) fsrsCard.last_review = new Date(currentCard.last_reviewed);
  const preview = f.repeat(fsrsCard, new Date());

  const isLeech = (currentCard.lapses || 0) >= 5;
  const suggested = suggestedRating(pronunciationScore);
  const isProduction = cardMode === 'production';
  const remainingCount = reviewQueue.length + learningQueue.length + (currentCard ? 1 : 0);

  return (
    <div className="min-h-dvh bg-warm-50 flex flex-col">
      {/* Error toast */}
      {errorMsg && (
        <div className="absolute top-4 left-4 right-4 z-50">
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm shadow-md">
            {errorMsg}
          </div>
        </div>
      )}

      {/* Undo toast — appears for 4s after each rating, clickable to revert */}
      {showUndo && lastAction && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <button
            onClick={handleUndo}
            className="bg-warm-800 text-white rounded-lg px-4 py-2 text-sm shadow-lg hover:bg-warm-700 transition-colors cursor-pointer flex items-center gap-2"
          >
            <span>Undo {ratingLabel(lastAction.rating)}</span>
            <span className="text-warm-400 text-xs">↩</span>
          </button>
        </div>
      )}

      {/* Header: back, mode toggle, auto-play TTS toggle, progress */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button onClick={onBack} className="text-warm-600 hover:text-warm-900 text-sm cursor-pointer">
          ← Back
        </button>

        {/* Production / Recognition mode toggle */}
        <div className="flex bg-warm-200 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => { if (isListening) stopListening(); setCardMode('production'); }}
            disabled={isListening}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              isProduction ? 'bg-white text-warm-900 shadow-sm' : 'text-warm-500'
            }`}
          >
            Production
          </button>
          <button
            onClick={() => { if (isListening) stopListening(); setCardMode('recognition'); }}
            disabled={isListening}
            className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
              !isProduction ? 'bg-white text-warm-900 shadow-sm' : 'text-warm-500'
            }`}
          >
            Recognition
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-play TTS toggle: cycles off → 0.7x → 1x → off */}
          <button
            onClick={() => setAutoPlayTTS(prev => prev === 'off' ? 'slow' : prev === 'slow' ? 'on' : 'off')}
            className={`p-1 rounded transition-colors cursor-pointer flex items-center gap-0.5 ${autoPlayTTS !== 'off' ? 'text-brand-600' : 'text-warm-400'}`}
            title={autoPlayTTS === 'off' ? 'Auto-play off' : autoPlayTTS === 'slow' ? 'Auto-play 0.7x' : 'Auto-play 1x'}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            {autoPlayTTS !== 'off' && (
              <span className="text-[9px] font-medium leading-none">{autoPlayTTS === 'slow' ? '.7x' : '1x'}</span>
            )}
          </button>
          {/* Progress: "X done · Y left · Z learning" */}
          <span className="text-warm-500 text-xs">
            {reviewed} done · {remainingCount} left
            {learningQueue.length > 0 && (
              <span className="text-amber-500"> · {learningQueue.length} learning</span>
            )}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div
          className="w-full max-w-sm bg-warm-100 rounded-2xl p-8 text-center select-none shadow-soft relative"
          onClick={!revealed ? handleReveal : undefined}
          style={!revealed ? { cursor: 'pointer' } : undefined}
        >
          {/* Leech badge — shown when a card has 5+ lapses (frequently forgotten) */}
          {isLeech && (
            <div className="absolute top-3 right-3 bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-medium">
              ⚠ Leech
            </div>
          )}

          {isProduction ? (
            /* === PRODUCTION MODE: English → speak Chinese === */
            <>
              {/* Front: English prompt */}
              <div className="text-lg font-semibold text-warm-900 mb-2">
                {currentCard.english}
              </div>

              {revealed ? (
                <div className="space-y-3 animate-fade-in">
                  {/* Chinese characters — colored per-character by pronunciation accuracy if available */}
                  <div className="text-4xl font-bold mb-2">
                    {wordScores ? (
                      wordScores.map((w, i) => (
                        <span key={i} className={pronColor(w.accuracyScore)}>
                          {w.word}
                        </span>
                      ))
                    ) : (
                      <span className="text-warm-900">{currentCard.word}</span>
                    )}
                  </div>

                  <div className="text-brand-600 text-xl">{currentCard.pinyin}</div>

                  {/* Overall pronunciation score */}
                  {pronunciationScore != null && (
                    <div className={`text-sm font-medium ${pronColor(pronunciationScore)}`}>
                      Pronunciation: {pronunciationScore}%
                    </div>
                  )}

                  {currentCard.context_sentence && (
                    <div className="text-warm-500 text-sm italic border-t border-warm-300 pt-3">
                      {currentCard.context_sentence}
                    </div>
                  )}

                  {/* Manual TTS buttons — always available regardless of auto-play setting */}
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => speak(currentCard.word)}
                      disabled={isSpeaking}
                      className="text-warm-500 hover:text-warm-700 transition-colors cursor-pointer disabled:opacity-40"
                      title="Play normal speed"
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => speak(currentCard.word, 0.7)}
                      disabled={isSpeaking}
                      className="text-warm-500 hover:text-warm-700 transition-colors cursor-pointer disabled:opacity-40 text-xs"
                      title="Play slow"
                    >
                      <span className="flex items-center gap-0.5">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                        </svg>
                        0.7x
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Interim text — live transcription while the user is speaking */}
                  {isListening && interimText && (
                    <div className="text-warm-500 text-lg italic mb-2">{interimText}</div>
                  )}
                  <p className="text-warm-400 text-sm">
                    {isListening ? 'Listening...' : 'Hold mic to speak, or tap to reveal'}
                  </p>
                </>
              )}
            </>
          ) : (
            /* === RECOGNITION MODE: Chinese → English === */
            <>
              {/* Front: Chinese (varies by display mode setting) */}
              {(displayMode === 'characters_only' || displayMode === 'both') && (
                <div className="text-4xl font-bold text-warm-900 mb-4">
                  {currentCard.word}
                </div>
              )}
              {(displayMode === 'pinyin_only' || displayMode === 'both') && (
                <div className={`text-brand-600 ${displayMode === 'pinyin_only' ? 'text-3xl font-bold' : 'text-xl'} mb-4`}>
                  {currentCard.pinyin}
                </div>
              )}

              {/* TTS button on the front of recognition cards — hear the word before revealing */}
              {!revealed && (
                <button
                  onClick={(e) => { e.stopPropagation(); speak(currentCard.word); }}
                  disabled={isSpeaking}
                  className="text-warm-400 hover:text-warm-600 transition-colors cursor-pointer disabled:opacity-40 mb-3 inline-block"
                  title="Hear pronunciation"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                  </svg>
                </button>
              )}

              {revealed ? (
                <div className="space-y-3 animate-fade-in">
                  {/* Reveal what was hidden: pinyin if characters-only, characters if pinyin-only */}
                  {displayMode === 'pinyin_only' && (
                    <div className="text-3xl font-bold text-warm-900">{currentCard.word}</div>
                  )}
                  {displayMode === 'characters_only' && (
                    <div className="text-brand-600 text-xl">{currentCard.pinyin}</div>
                  )}
                  <div className="text-warm-700 text-lg">{currentCard.english}</div>
                  {currentCard.context_sentence && (
                    <div className="text-warm-500 text-sm italic mt-2 border-t border-warm-300 pt-3">
                      {currentCard.context_sentence}
                    </div>
                  )}

                  {/* Manual TTS buttons — always available regardless of auto-play setting */}
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => speak(currentCard.word)}
                      disabled={isSpeaking}
                      className="text-warm-500 hover:text-warm-700 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => speak(currentCard.word, 0.7)}
                      disabled={isSpeaking}
                      className="text-warm-500 hover:text-warm-700 transition-colors cursor-pointer disabled:opacity-40 text-xs"
                    >
                      <span className="flex items-center gap-0.5">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                        </svg>
                        0.7x
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-warm-500 text-sm">Tap to reveal</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom area: mic button (production mode) + rating buttons */}
      <div className="shrink-0 px-4 pb-8 pt-4">
        {/* Mic button — hold to speak, release to stop. Production mode only, hidden after reveal. */}
        {isProduction && !revealed && (
          <div className="flex flex-col items-center mb-4">
            <div className="text-xs text-warm-500 mb-2 h-4">
              {isListening ? (interimText ? 'Listening...' : 'Hold to speak...') : 'Hold to speak'}
            </div>
            <button
              onPointerDown={handleMicDown}
              onPointerUp={handleMicUp}
              onPointerLeave={handleMicUp}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!speechReady || isSpeaking}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all select-none touch-none
                ${!speechReady
                  ? 'bg-warm-200 opacity-50 cursor-not-allowed'
                  : isListening
                    ? 'bg-red-500 scale-110 mic-pulse cursor-pointer'
                    : 'bg-warm-200 hover:bg-warm-300 active:scale-95 cursor-pointer'
                }
              `}
            >
              <svg className={`w-6 h-6 ${isListening ? 'text-white' : 'text-warm-900'}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          </div>
        )}

        {/* Rating buttons — shown after reveal. Each shows the FSRS-predicted next interval. */}
        {revealed && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto">
              {[Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map(rating => (
                <button
                  key={rating}
                  onClick={() => handleRate(rating)}
                  className={`${ratingColor(rating, suggested === rating)} text-white rounded-xl py-3 px-2 text-center transition-all cursor-pointer`}
                >
                  <div className="text-sm font-medium">{ratingLabel(rating)}</div>
                  <div className="text-[10px] opacity-75 mt-0.5">
                    {formatInterval(preview[rating].card)}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-center mt-3">
              <button onClick={handleTryAgain} className="text-warm-500 hover:text-warm-700 text-sm underline cursor-pointer">
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
