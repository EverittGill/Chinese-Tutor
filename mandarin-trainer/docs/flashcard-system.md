# Flashcard System

The flashcard system is an FSRS-based spaced repetition reviewer for Mandarin vocabulary. Words enter the system from conversation sessions (when Claude introduces new vocabulary) and are reviewed on a scientifically-optimized schedule.

## How FSRS Works

FSRS (Free Spaced Repetition Scheduler) is the algorithm behind the review scheduling. It replaces older systems like SM-2 (used by Anki) with a more accurate model of human memory.

**Core idea:** Each card has a *stability* value (how long you can go before forgetting) and a *difficulty* value (how inherently hard the card is for you). After each review, FSRS uses your rating to update these values and compute the next review date.

**The four ratings and what they mean:**

| Rating | When to use | Effect on scheduling |
|--------|-------------|---------------------|
| Again | Couldn't recall at all | Resets stability, card re-enters learning (short intervals: 1m, 10m) |
| Hard | Recalled but with significant effort | Slightly decreases stability growth, shorter interval than Good |
| Good | Recalled correctly with moderate effort | Normal stability growth, standard interval |
| Easy | Recalled instantly with no effort | Large stability boost, much longer interval |

**Key FSRS fields stored per card (`user_vocabulary` table):**
- `difficulty` — 0 to 1, how hard this card is for the learner
- `stability` — days of memory stability (how long until ~90% chance of forgetting)
- `retrievability` — estimated probability of recall right now
- `reps` — total successful reviews
- `lapses` — times the card was forgotten (rated Again after being "learned")
- `state` — 0=New, 1=Learning, 2=Review, 3=Relearning
- `due_date` — when the card should next be reviewed

The `ts-fsrs` library handles all the math. We just pass in current card state + rating, and it returns the updated fields.

## Two-Queue Architecture

Cards are managed in two separate queues rather than a single array:

### Review Queue
- Populated on session start from `getDueVocabulary(50)`
- Fisher-Yates shuffled immediately to prevent contextual priming (e.g. reviewing all food words in a row, which creates false confidence)
- Cards are pulled from the front, one at a time
- Once a card leaves this queue, it doesn't come back

### Learning Queue
- Starts empty
- Cards enter here when rated Again or Hard and their next due time is within 10 minutes
- These cards need to be seen again soon (typically 1-10 minutes) to move from short-term to long-term memory
- Cards wait on a timer — not shown until their `due_date` arrives

### Card Selection Priority

When the current card is rated and the system needs the next one:

1. **Ready learning cards** — Learning cards whose timer has expired get priority. They're sorted by due date (oldest first).
2. **Review queue** — If no learning cards are ready, pull the next card from the shuffled review queue.
3. **Waiting screen** — If only learning cards remain but none are ready yet, show a live countdown until the nearest one is due.
4. **Session complete** — Both queues empty. Check the DB for more due cards beyond the 50-card batch.

### Why Two Queues?

The old approach used a single array with a linear index (`currentIdx++`). Problems:

- "Again" cards were re-inserted into the same array at a calculated position, but this was fragile — the insertion point could land in odd spots depending on how many cards were left
- No way to show a waiting screen when only short-interval cards remained
- Cards rated "Again" at the end of the session would just vanish (nowhere to re-insert them)

The two-queue approach cleanly separates "cards you haven't seen yet" from "cards you need to see again soon."

## Card Modes

### Production Mode
**Flow:** English prompt → user holds mic and speaks the Chinese word → Azure Speech SDK scores pronunciation → card auto-reveals with results

- The mic uses `useAzureSpeech` with the target word as a reference text, so Azure can score accuracy per character
- Each character gets color-coded: green (≥80%), yellow (60-79%), red (<60%)
- The overall pronunciation score drives a **suggested rating** — the corresponding button gets a highlight ring so the user can quickly tap without overthinking
- If the user doesn't want to use the mic, they can tap the card to manually reveal

### Recognition Mode
**Flow:** Chinese characters/pinyin shown → user mentally recalls the meaning → tap to reveal → English meaning shown

- What's shown on the front depends on the **display mode** setting:
  - `characters_only` — shows 餐厅, hides pinyin until reveal
  - `pinyin_only` — shows cāntīng, hides characters until reveal
  - `both` — shows everything on front (mainly tests English recall)
- A small speaker button on the front lets the user hear the pronunciation before revealing
- No pronunciation scoring in this mode

## Auto-Play TTS

A header toggle cycles through three states:

| State | Icon | Behavior |
|-------|------|----------|
| Off | Muted speaker | No auto-play. User must tap the on-card speaker buttons manually. |
| Slow (0.7x) | Speaker + ".7x" | TTS fires automatically at 0.7x speed when any card is revealed. |
| On (1x) | Speaker + "1x" | TTS fires automatically at normal speed when any card is revealed. |

The per-card speaker buttons (normal speed + 0.7x) remain functional in all states. Auto-play is a convenience for users who always want to hear the word — they can turn it off and still use the buttons for individual cards.

## Undo System

After each rating, a toast appears for 4 seconds with an "Undo" button. Tapping it:

1. **Reverts the DB** — Writes back the original FSRS fields (`difficulty`, `stability`, `reps`, `lapses`, `state`, `due_date`), erasing the rating
2. **Fixes the queues** — Removes the card from the learning queue (if it was re-queued by Again/Hard), pushes the card-that-was-about-to-be-shown back onto the review queue
3. **Restores the card** — The original card becomes current again, un-revealed, as if the rating never happened
4. **Adjusts the counter** — `reviewed` count decrements by 1

**Why undo matters:** FSRS state changes are destructive. Rating a mature card (stability = 30 days) as "Again" resets its stability to near-zero. A single mis-tap could undo weeks of progress on that card. The 4-second window is short enough to not clutter the UI but long enough to catch mistakes.

Note: the review log entry is not deleted on undo (it would require tracking the log ID). This is acceptable — one extra log entry has no effect on scheduling since FSRS only uses the card's current state, not the log history.

## Batch Loading

`getDueVocabulary(50)` loads at most 50 due cards per session batch. This is a practical limit, not a hard cap:

- Keeps initial load fast (single Supabase query with `.limit(50)`)
- Prevents memory bloat from loading hundreds of cards into React state
- 50 cards is a comfortable session length (~10-15 minutes)

When a batch is exhausted, the end screen checks the DB for remaining due cards. If more exist:
- Shows "Batch complete!" instead of "All done!"
- Displays how many more cards are due
- "Continue" button loads and shuffles the next 50
- The `reviewed` counter persists across batches so the user sees their total

## Leech Detection

A card with 5+ `lapses` (times forgotten after being learned) is flagged as a **leech**. Currently this is badge-only — a small amber "⚠ Leech" tag in the corner of the card. The `FLASHCARD_IMPROVEMENTS.md` file describes planned leech interventions (word decomposition, mnemonics, suspend).

## Progress Indicator

The header shows: `X done · Y left · Z learning`

- **done** = total cards rated this session (persists across batches)
- **left** = review queue + learning queue + current card
- **learning** = cards on short-interval timers (only shown when > 0, in amber)

## Data Flow

```
getDueVocabulary(50)          — Fetch due cards from user_vocabulary JOIN vocabulary
    ↓
Fisher-Yates shuffle          — Randomize order for interleaving benefit
    ↓
[reviewQueue] → currentCard   — Pull cards one at a time
    ↓
User rates (Again/Hard/Good/Easy)
    ↓
f.repeat(fsrsCard, now)       — FSRS computes new scheduling fields
    ↓
updateFSRSCard(id, fields)    — Write new state to user_vocabulary
saveReviewLog(id, rating, …)  — Append to review_log for analytics
    ↓
If due again < 10min → learningQueue (re-enter session on timer)
If due later → card graduates (won't appear again this session)
    ↓
pickNextCard()                — Select next card by priority
```

## Key Files

| File | Role |
|------|------|
| `src/components/FlashcardScreen.jsx` | Main component — all review UI and scheduling logic |
| `src/utils/db.js` | `getDueVocabulary()`, `updateFSRSCard()`, `saveReviewLog()` — Supabase queries |
| `src/utils/localDb.js` | Same API as db.js but backed by localStorage (fallback when Supabase is unavailable) |
| `src/hooks/useAzureSpeech.js` | STT + pronunciation scoring for production mode |
| `src/hooks/useAzureTTS.js` | Text-to-speech via Azure SSML (supports rate parameter for slow playback) |

## Database Tables

**`vocabulary`** — Pure dictionary. One row per word, `word` is UNIQUE.
- `word`, `pinyin`, `english`, `hsk_level`

**`user_vocabulary`** — User's relationship with each word. FSRS scheduling fields live here.
- `vocabulary_id` (FK), `status`, `context_sentence`
- FSRS fields: `difficulty`, `stability`, `retrievability`, `reps`, `lapses`, `state`, `due_date`, `last_reviewed`
- `times_seen`, `times_correct`, `times_incorrect`

**`review_log`** — Every individual review attempt. Used for analytics, not for scheduling.
- `user_vocabulary_id`, `rating` (1-4), `review_duration_ms`, `scheduled_days`, `actual_days`
