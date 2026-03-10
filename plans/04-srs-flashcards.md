# Feature 04: SRS Flashcard Review

> **Type:** Standalone feature — new screen with nav button
> **Complexity:** Medium-Large
> **Prerequisites:** Feature 03 (Context Sentences) for context display on cards
> **Research basis:** Section 1.1 (SRS / FSRS), Section 1.3 (Active Recall), Section 1.4 (Forgetting Curve), Section 3.3 (Sentences Over Isolated Words), Section 5.2 (Contextual Learning), Section 6.1 (P0 priority)

---

## What It Does

A dedicated flashcard review screen using the FSRS algorithm (Free Spaced Repetition Scheduler). The user reviews vocabulary words that are "due" — words whose memory has decayed to the point where they need reinforcement. Each card shows a word in context and requires the user to actively recall the meaning before revealing the answer.

### Why FSRS Over SM-2

The research is clear: FSRS achieves **20-30% fewer reviews for the same retention level** compared to SM-2. It models memory with three variables (Difficulty, Stability, Retrievability) and uses 19 trainable weights. The `ts-fsrs` npm package provides a clean browser-compatible implementation.

### Two Card Types

The research on active recall (section 1.3) says retrieval from memory is fundamentally different from recognition. We implement both:

1. **Recognition card** (Chinese → English): Front shows Chinese characters + audio. User recalls the meaning, then flips to check.
2. **Production card** (English → Chinese): Front shows English + context sentence with a blank. User recalls the Chinese word, then flips to check.

Production cards are harder but dramatically better for retention. They exercise the same "retrieval from memory" pathway that real conversation demands.

## How It Looks (iPhone 13 Pro Max)

### Access Point — TopicSelector Nav

```
┌──────────────────────────────────────┐
│ [📚 Vocabulary ] [📊 Progress  ]     │
│ [🗂️ Flashcards ] [🎯 Shadowing ]     │
│       ⑫                              │
│    (due badge)                        │
└──────────────────────────────────────┘
```

The nav buttons use a 2x2 grid layout. The Flashcards button has a teal badge showing the number of words due for review. Badge shows "99+" if over 99.

### Flashcard Screen — Front (Recognition)

```
┌──────────────────────────────────────┐
│ ← Back                 8 remaining   │
│                                      │
│                                      │
│        ┌────────────────────┐        │
│        │                    │        │
│        │       商店          │        │
│        │                    │        │
│        │   Tap to reveal    │        │
│        │                    │        │
│        └────────────────────┘        │
│                                      │
│              🔊 Listen               │
│                                      │
│                                      │
└──────────────────────────────────────┘
```

Auto-plays TTS when the card appears (research section 3.4: multi-modal input). "Listen" button for manual replay.

### Flashcard Screen — Front (Production)

```
┌──────────────────────────────────────┐
│ ← Back                 5 remaining   │
│                                      │
│                                      │
│        ┌────────────────────┐        │
│        │                    │        │
│        │      "store"       │        │
│        │                    │        │
│        │  我想去___买东西     │        │
│        │                    │        │
│        │   Tap to reveal    │        │
│        │                    │        │
│        └────────────────────┘        │
│                                      │
│                                      │
│                                      │
└──────────────────────────────────────┘
```

Shows English meaning + context sentence with the target word blanked out. No audio on front (that would give it away).

### Flashcard Screen — Back (Both Types)

```
┌──────────────────────────────────────┐
│ ← Back                 8 remaining   │
│                                      │
│        ┌────────────────────┐        │
│        │                    │        │
│        │       商店          │        │
│        │    shāng diàn      │        │
│        │      store         │        │
│        │                    │        │
│        │ 我想去商店买东西     │        │
│        │                    │        │
│        │  Seen 5x · 78% acc │        │
│        │     🔊 Listen      │        │
│        └────────────────────┘        │
│                                      │
│  ┌────┐ ┌────┐ ┌─────┐ ┌─────┐     │
│  │Again│ │Hard│ │ Good│ │ Easy│      │
│  │ red │ │org │ │ grn │ │ teal│      │
│  └────┘ └────┘ └─────┘ └─────┘      │
└──────────────────────────────────────┘
```

Shows: Chinese characters, pinyin, English, context sentence (full, not blanked), stats, listen button. Four rating buttons at the bottom.

### Complete Screen

```
┌──────────────────────────────────────┐
│          Review Complete!            │
│                                      │
│        ┌────────────────────┐        │
│        │        15          │        │
│        │   cards reviewed   │        │
│        │                    │        │
│        │ Again Hard Good Easy│       │
│        │   2    3    8    2  │        │
│        └────────────────────┘        │
│                                      │
│     [ Back to Topics ]               │
│                                      │
└──────────────────────────────────────┘
```

## FSRS Integration

### Package

```
npm install ts-fsrs
```

### Core API Usage

```js
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';

const f = fsrs(); // uses default parameters — good starting point

// New card (first time reviewing a word):
const card = createEmptyCard();
const now = new Date();
const scheduling = f.repeat(card, now);

// User rates "Good":
const result = scheduling[Rating.Good];
// result.card = { due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review }
// result.log = { rating, state, due, stability, difficulty, elapsed_days, scheduled_days, review }

// Save result.card to database, query by card.due <= now() for next review
```

### Rating Mapping

| Button | FSRS Rating | Behavior |
|--------|-------------|----------|
| Again | `Rating.Again` (1) | Card enters relearning. Shows again in ~1 min (same session). |
| Hard | `Rating.Hard` (2) | Short interval increase. |
| Good | `Rating.Good` (3) | Standard interval increase. |
| Easy | `Rating.Easy` (4) | Large interval jump. |

### Database Storage

Store the FSRS card state as a JSON column for simplicity:

```sql
ALTER TABLE vocabulary ADD COLUMN fsrs_card jsonb;
ALTER TABLE vocabulary ADD COLUMN next_review_at timestamptz;
```

`fsrs_card` holds the full card object from ts-fsrs. `next_review_at` is denormalized from `fsrs_card.due` for efficient querying (`WHERE next_review_at <= NOW()`).

For localStorage, the card object is just a regular JS object — serializes naturally with JSON.stringify.

## Card Type Logic

Each word gets **one card type per review session**, alternating between recognition and production:

- If the word has been reviewed an even number of times → recognition (Chinese → English)
- Odd number → production (English → Chinese)
- Words without a `context_sentence` always get recognition cards (can't do production without context)

This ensures balanced practice without doubling the review count.

## "Again" Logic

When the user rates "Again":
1. The FSRS card is updated (enters relearning state, due in ~60 seconds)
2. The card is removed from current position and reinserted ~4 positions later in the queue
3. `currentIndex` is NOT incremented (next card shifts into position)

For all other ratings, `currentIndex` increments normally.

## New Files

### `src/utils/srs.js`

Thin wrapper around ts-fsrs that handles serialization:

```js
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';

const f = fsrs();

export { Rating };

export function getEmptyCard() {
  return createEmptyCard();
}

export function reviewCard(card, rating) {
  // card can be a plain object from the database — ts-fsrs handles it
  const now = new Date();
  const scheduling = f.repeat(card, now);
  const result = scheduling[rating];
  return {
    card: result.card,
    log: result.log,
    nextReviewAt: result.card.due.toISOString()
  };
}
```

### `src/components/FlashcardScreen.jsx`

Full component (~200 lines). See implementation details below.

**State:**
- `cards` — vocabulary words due for review (from `getWordsForReview`)
- `currentIndex` — which card
- `flipped` — front/back
- `cardType` — `'recognition'` or `'production'` (computed per card)
- `loading` — initial load
- `stats` — `{ reviewed, again, hard, good, easy }`

**Key behaviors:**
- On mount: fetch due words via `getWordsForReview(30)`
- On card appear (front): auto-play TTS for recognition cards
- On flip: show full info + rating buttons
- On rate: call `reviewCard()`, persist to DB, advance
- "Again" re-inserts card later in queue

## Modified Files

### `src/utils/db.js`

Append two new functions:

```js
// SRS Review

export async function getWordsForReview(limit = 30) {
  if (!useSupabase()) return local.getWordsForReview(limit);
  const sb = getSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('vocabulary')
    .select('*')
    .in('status', ['learning', 'known'])
    .or(`next_review_at.is.null,next_review_at.lte.${now}`)
    .order('next_review_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) { console.error('getWordsForReview:', error); return []; }
  return data;
}

export async function updateReviewResult(word, fsrsCard, nextReviewAt) {
  if (!useSupabase()) return local.updateReviewResult(word, fsrsCard, nextReviewAt);
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('vocabulary')
    .update({
      fsrs_card: fsrsCard,
      next_review_at: nextReviewAt,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('word', word);
  if (error) console.error('updateReviewResult:', error);
}
```

### `src/utils/localDb.js`

Matching localStorage implementations:

```js
export async function getWordsForReview(limit = 30) {
  const now = new Date().toISOString();
  const vocab = getStore('mt_vocabulary')
    .filter(w => (w.status === 'learning' || w.status === 'known') &&
                 (!w.next_review_at || w.next_review_at <= now))
    .sort((a, b) => {
      if (!a.next_review_at && !b.next_review_at) return 0;
      if (!a.next_review_at) return -1;
      if (!b.next_review_at) return 1;
      return a.next_review_at.localeCompare(b.next_review_at);
    });
  return vocab.slice(0, limit);
}

export async function updateReviewResult(word, fsrsCard, nextReviewAt) {
  const vocab = getStore('mt_vocabulary');
  const idx = vocab.findIndex(w => w.word === word);
  if (idx === -1) return;
  vocab[idx] = {
    ...vocab[idx],
    fsrs_card: fsrsCard,
    next_review_at: nextReviewAt,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  setStore('mt_vocabulary', vocab);
}
```

### `database/schema.sql`

Add to vocabulary CREATE TABLE (after `context_sentence text,`):
```sql
  fsrs_card jsonb,
  next_review_at timestamptz,
```

Migration comment:
```sql
-- Migration: Add FSRS columns for flashcard review
-- ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS fsrs_card jsonb;
-- ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS next_review_at timestamptz;
```

### `src/App.jsx`

Add import and route:
```js
import FlashcardScreen from './components/FlashcardScreen';

// In render, after dashboard route:
if (screen === 'flashcards') {
  return <FlashcardScreen onBack={() => setScreen('topics')} />;
}
```

### `src/components/TopicSelector.jsx`

Add imports:
```js
import { useState, useEffect } from 'react';
import { getWordsForReview } from '../utils/db';
```

Add state + effect inside component:
```js
const [dueCount, setDueCount] = useState(0);
useEffect(() => {
  getWordsForReview(100).then(words => setDueCount(words.length));
}, []);
```

Change nav container from `flex gap-3` to `grid grid-cols-2 gap-3`.

Add Flashcards button (remove `flex-1` from all nav buttons since grid handles sizing):
```jsx
<button
  onClick={() => onNavigate('flashcards')}
  className="bg-slate-800 hover:bg-slate-700 rounded-xl p-3 text-center transition-colors cursor-pointer relative"
>
  <span className="text-lg mr-1">🗂️</span>
  <span className="text-sm text-slate-300">Flashcards</span>
  {dueCount > 0 && (
    <span className="absolute -top-1 -right-1 bg-teal-500 text-white text-[10px] rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
      {dueCount > 99 ? '99+' : dueCount}
    </span>
  )}
</button>
```

### `package.json`

```
npm install ts-fsrs
```

## First-Time Card Initialization

When a word has no `fsrs_card` (null), it's being reviewed for the first time. The FlashcardScreen creates an empty FSRS card on the fly:

```js
import { getEmptyCard, reviewCard, Rating } from '../utils/srs';

// In handleRate:
const fsrsCard = word.fsrs_card || getEmptyCard();
const { card: updatedCard, nextReviewAt } = reviewCard(fsrsCard, rating);
updateReviewResult(word.word, updatedCard, nextReviewAt);
```

This means existing vocabulary (imported or from conversations) seamlessly enters the SRS system on first review — no migration needed for the data itself.

## Verification

1. `npm install ts-fsrs` succeeds
2. `npx vite build` — no errors
3. Import some vocabulary words (or have existing ones from conversations)
4. TopicSelector shows Flashcards button with due count badge
5. Tap Flashcards — first card appears (front side)
6. Recognition card: shows Chinese characters, auto-plays TTS
7. Production card: shows English + context sentence with blank (only for words that have context_sentence)
8. Tap card — flips to show full info (pinyin, English, context, stats)
9. Tap "Listen" — TTS plays
10. Rate "Good" — next card appears
11. Rate "Again" — card reappears ~4 cards later
12. Complete all cards — summary screen with rating breakdown
13. Return to Flashcards immediately — words rated Good/Hard/Easy are gone (scheduled for future). Words rated "Again" may still show (60s interval).
14. All existing features still work
