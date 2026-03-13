import { useState, useEffect, useCallback, useRef } from 'react';
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import { getDueVocabulary, updateFSRSCard, saveReviewLog } from '../utils/db';

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

function ratingColor(rating) {
  switch (rating) {
    case Rating.Again: return 'bg-red-600 hover:bg-red-700';
    case Rating.Hard: return 'bg-orange-600 hover:bg-orange-700';
    case Rating.Good: return 'bg-brand-600 hover:bg-brand-700';
    case Rating.Easy: return 'bg-green-600 hover:bg-green-700';
    default: return 'bg-warm-400';
  }
}

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

export default function FlashcardScreen({ onBack }) {
  const [cards, setCards] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const startTimeRef = useRef(null);

  useEffect(() => {
    getDueVocabulary(50).then(vocab => {
      setCards(vocab);
      setLoading(false);
    });
  }, []);

  const currentCard = cards[currentIdx];

  const handleReveal = useCallback(() => {
    startTimeRef.current = Date.now();
    setRevealed(true);
  }, []);

  const handleRate = useCallback(async (rating) => {
    if (!currentCard) return;
    const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;

    // Build FSRS card from current state
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

    // Calculate actual_days
    const actualDays = currentCard.last_reviewed
      ? (Date.now() - new Date(currentCard.last_reviewed).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    // Save to DB
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

    setReviewed(prev => prev + 1);
    setRevealed(false);
    setCurrentIdx(prev => prev + 1);
  }, [currentCard]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-warm-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // All done
  if (!currentCard || currentIdx >= cards.length) {
    return (
      <div className="min-h-dvh bg-warm-50 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="text-4xl">🎉</div>
          <h2 className="text-xl font-bold text-warm-900">
            {reviewed === 0 ? 'No cards due!' : 'All done!'}
          </h2>
          <p className="text-warm-600 text-sm">
            {reviewed > 0 ? `Reviewed ${reviewed} card${reviewed !== 1 ? 's' : ''}` : 'Come back later for more reviews'}
          </p>
          <button
            onClick={onBack}
            className="bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg px-6 py-2.5 transition-colors cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Preview scheduling for all ratings
  const fsrsCard = createEmptyCard();
  fsrsCard.difficulty = currentCard.difficulty || 0;
  fsrsCard.stability = currentCard.stability || 0;
  fsrsCard.reps = currentCard.reps || 0;
  fsrsCard.lapses = currentCard.lapses || 0;
  fsrsCard.state = currentCard.state || 0;
  if (currentCard.due_date) fsrsCard.due = new Date(currentCard.due_date);
  if (currentCard.last_reviewed) fsrsCard.last_review = new Date(currentCard.last_reviewed);
  const preview = f.repeat(fsrsCard, new Date());

  const remaining = cards.length - currentIdx;

  return (
    <div className="min-h-dvh bg-warm-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button onClick={onBack} className="text-warm-600 hover:text-warm-900 text-sm cursor-pointer">
          ← Back
        </button>
        <span className="text-warm-500 text-xs">
          {reviewed} reviewed · {remaining} remaining
        </span>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div
          className="w-full max-w-sm bg-warm-100 rounded-2xl p-8 text-center cursor-pointer select-none shadow-soft"
          onClick={!revealed ? handleReveal : undefined}
        >
          {/* Front: Chinese character */}
          <div className="text-4xl font-bold text-warm-900 mb-4">
            {currentCard.word}
          </div>

          {revealed ? (
            <div className="space-y-3 animate-fade-in">
              <div className="text-brand-600 text-xl">{currentCard.pinyin}</div>
              <div className="text-warm-700 text-lg">{currentCard.english}</div>
              {currentCard.context_sentence && (
                <div className="text-warm-500 text-sm italic mt-2 border-t border-warm-300 pt-3">
                  {currentCard.context_sentence}
                </div>
              )}
            </div>
          ) : (
            <p className="text-warm-500 text-sm">Tap to reveal</p>
          )}
        </div>
      </div>

      {/* Rating buttons */}
      {revealed && (
        <div className="shrink-0 px-4 pb-8 pt-4 animate-fade-in">
          <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto">
            {[Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map(rating => (
              <button
                key={rating}
                onClick={() => handleRate(rating)}
                className={`${ratingColor(rating)} text-white rounded-xl py-3 px-2 text-center transition-colors cursor-pointer`}
              >
                <div className="text-sm font-medium">{ratingLabel(rating)}</div>
                <div className="text-[10px] opacity-75 mt-0.5">
                  {formatInterval(preview[rating].card)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
