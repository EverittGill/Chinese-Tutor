# Implementation Log

## Phase 0: Schema Rework

**Problem:** The original `vocabulary` table mixed dictionary data (word, pinyin, english) with user progress (times_seen, status, accuracy). This made it impossible to:
- Pre-load HSK word lists without creating fake user progress
- Run FSRS scheduling (needs its own state columns)
- Share dictionary entries across features

**Solution:** Split into `vocabulary` (dictionary) + `user_vocabulary` (progress/FSRS). See `database/SCHEMA.md` for full details.

**Files changed:**
- `database/schema.sql` — Full rewrite
- `src/utils/db.js` — All vocabulary functions now join across both tables; added `getDueVocabulary()`, `updateFSRSCard()`, `saveReviewLog()`
- `src/utils/localDb.js` — Mirrored the split using `mt_vocab_dict` and `mt_user_vocab` localStorage keys
- `getVocabulary()` returns flattened objects for backward compatibility — callers don't need to know about the split

---

## Plan 01: Pronunciation Score Coloring

**What:** User's spoken words are colored green (>=80), yellow (60-79), or red (<60) based on Azure pronunciation scores. Tapping a word shows its score in the popover.

**How it works:**
1. `ConversationScreen` already stored `wordScores` (Azure's per-word data) in chat history — now passes it to `ChatBubble`
2. `ChatBubble` builds a `pronMap` from `wordScores` and passes scores to `ClickableWord`
3. `ClickableWord` applies CSS classes `pron-good`, `pron-ok`, `pron-bad` which set text color
4. When no `user_words` from Claude are available, falls back to rendering Azure's raw words with `PronunciationWord` component

**Files changed:**
- `src/components/ChatBubble.jsx` — Added `wordScores` prop, pronunciation mapping, `PronunciationWord` component
- `src/components/ClickableWord.jsx` — Added `pronScore` prop, color classes, score in popover
- `src/components/ConversationScreen.jsx` — Passes `wordScores` to ChatBubble
- `src/index.css` — Added `.pron-good`, `.pron-ok`, `.pron-bad` CSS classes

---

## Plan 02: TTS Speed Control

**What:** A "0.7x" slow replay button on AI messages that plays the Chinese text at 70% speed.

**How it works:**
1. `useAzureTTS.speak()` now accepts a `rate` parameter (default 1.0)
2. Azure TTS: rate is applied via SSML `<prosody rate="-30%">` tag
3. Web Speech API fallback: rate multiplied into `utterance.rate`
4. `ChatBubble` renders a second button next to the normal play button

**Files changed:**
- `src/hooks/useAzureTTS.js` — `buildSsml()` accepts rate, `speak()` accepts rate param
- `src/components/ChatBubble.jsx` — Added `onSpeakSlow` prop and button
- `src/components/ConversationScreen.jsx` — Passes `onSpeakSlow={() => speak(text, 0.7)}`

---

## Plan 03: Context Sentence Persistence

**What:** When Claude introduces new vocabulary with a `context` field, that context is saved as `user_vocabulary.context_sentence`.

**How it works:**
1. Claude's tool response includes `new_vocabulary[].context` — "When to use this word"
2. `ConversationScreen` now passes `v.context` as the 5th argument to `upsertWord()`
3. `upsertWord()` in both `db.js` and `localDb.js` saves it to `context_sentence`

**Files changed:**
- `src/components/ConversationScreen.jsx` — Added `v.context || null` to `upsertWord()` call
- `src/utils/db.js` — `upsertWord()` accepts `contextSentence` param, saves to `user_vocabulary`
- `src/utils/localDb.js` — Same

---

## Plan 04: FSRS Flashcard Review

**What:** A dedicated flashcard review screen using the FSRS algorithm. Shows due vocabulary cards, user taps to reveal, then rates Again/Hard/Good/Easy.

**How it works:**
1. `getDueVocabulary()` queries `user_vocabulary WHERE due_date <= now()`
2. Cards are displayed one at a time — front shows Chinese characters, tap reveals pinyin + English + context sentence
3. Rating buttons show the next review interval (e.g., "1m", "6h", "3d")
4. On rate: `ts-fsrs` computes new card state → saved via `updateFSRSCard()` + `saveReviewLog()`
5. Completion screen shows total reviewed

**Package installed:** `ts-fsrs`

**Files created:**
- `src/components/FlashcardScreen.jsx` — Full flashcard review screen

**Files changed:**
- `src/App.jsx` — Added `FlashcardScreen` import and `flashcards` route
- `src/components/TopicSelector.jsx` — Added "Review" button in navigation bar
- `src/utils/db.js` — Added `getDueVocabulary()`, `updateFSRSCard()`, `saveReviewLog()`
- `src/utils/localDb.js` — Same three functions for localStorage

**Differences from Plan 04 spec:**
- Simplified to recognition cards only (Chinese → English) rather than alternating recognition/production. Production cards can be added later.
- No auto-play TTS on card appear (avoids audio overlap issues on mobile). User can tap play manually.
- No due count badge on TopicSelector (keeps it simple for now).
