# Flashcard Feature — Possible Improvements for Future Development

## Current State

The flashcard system uses FSRS (Free Spaced Repetition Scheduler) with two card modes:
- **Production mode**: English prompt → user speaks the Chinese word → pronunciation scored via Azure Speech SDK
- **Recognition mode**: Chinese characters/pinyin shown → tap to reveal English meaning
- FSRS default parameters with 0.9 retention target
- TTS playback at normal and 0.7x speed
- Leech detection at 5+ lapses (badge only)
- Display mode settings: characters only, pinyin only, or both
- **Dynamic queue scheduling** — separate review queue and learning queue (replaces static array + linear index)
- **Countdown/waiting screen** — when only learning cards remain, shows a live countdown until the next card is due
- **Shuffle/interleave on load** — Fisher-Yates shuffle of due cards at session start
- **Undo last rating** — 4-second undo toast after each rating, reverts DB + re-queues card
- **Smart progress indicator** — shows `X done · Y left · Z learning` instead of `4/54`

Key files: `src/components/FlashcardScreen.jsx`, `src/utils/db.js`, `src/utils/localDb.js`

---

## 1. Cloze Sentence Cards

**What:** Show the context sentence with the target word replaced by a blank. The user must recall the missing word from context.

**Example:**
- Front: `我想去 _____ 吃饭` (I want to go to _____ to eat)
- Answer: `餐厅 (cāntīng) — restaurant`

**Why this matters:** Research on "desirable difficulty" (Bjork, 1994) shows that retrieving a word from context activates deeper encoding than isolated word recall. Cloze deletion forces the learner to process the surrounding grammar and meaning, creating multiple retrieval cues. Studies on L2 vocabulary acquisition (Hulstijn & Laufer, 2001) found that context-based tasks produced ~40% better long-term retention than word-list study.

**Implementation details:**
- Data is already available: `currentCard.context_sentence` contains a Chinese sentence using the target word, stored when the word was first learned in conversation
- Add a third card mode toggle: `production | recognition | cloze`
- Rendering: parse `context_sentence` to find `currentCard.word` and replace with a blank (`_____`). Use simple string replacement — the word stored in `vocabulary.word` should match a substring of the context sentence since both come from Claude's structured response
- Reveal shows the full sentence with the target word highlighted, plus pinyin and English
- Combine with speech: user could speak the missing word for pronunciation scoring (pass just the target word to `useAzureSpeech.startListening`)
- Edge case: some cards may not have a `context_sentence` (older vocabulary added before context persistence was implemented). Fall back to standard production/recognition mode for these cards
- FSRS scheduling stays the same — cloze is just a different presentation, same rating buttons

**Effort:** ~3 hours

---

## 2. Audio-Only Card Mode

**What:** Play the word via TTS. The user must identify the word without seeing any characters or pinyin. Tests pure listening comprehension.

**Flow:**
1. Card appears with just a speaker icon and "Listen and identify"
2. TTS plays the word automatically on card display
3. User taps to reveal: shows characters, pinyin, and English
4. User self-rates (or speaks the word for pronunciation scoring before reveal)

**Why this matters:** Listening and reading are neurologically distinct skills. A learner who can recognize 中文 on screen may fail to identify it in speech, especially with tonal confusion (zhōngwén vs zhòngwén). Audio-only cards specifically train the phonological loop (Baddeley, 2003), which is critical for Mandarin where tones carry semantic meaning. This mode addresses a common failure mode: learners who can read characters but can't understand spoken Mandarin.

**Implementation details:**
- Add `audio` to the card mode toggle: `production | recognition | audio`
- On card display, auto-trigger `speak(currentCard.word)` via `useAzureTTS`
- Show a replay button so the user can listen again (both normal and 0.7x speed)
- The front of the card shows only: a speaker icon, replay buttons, and "Tap to reveal" prompt
- Reveal shows characters, pinyin, English, and context sentence
- Optional enhancement: after listening, user speaks the word back. Compare their pronunciation score against a threshold. This creates a listen-then-produce loop that's highly effective for tonal accuracy
- Settings consideration: add `audio` to the `DISPLAY_MODES` or create a separate `CARD_MODES` array since this is fundamentally a different interaction pattern than display mode (which controls what's visible on recognition cards)

**Effort:** ~2 hours

---

## 3. ~~Shuffle / Interleave Within Due Window~~ ✓ IMPLEMENTED

Implemented as part of the dynamic scheduling overhaul. Fisher-Yates shuffle runs on mount after `getDueVocabulary(50)` returns. Re-queued learning cards are handled by the separate learning queue with timer-based scheduling, so they naturally interleave without needing special shuffle logic.

---

## 4. Session Summary Screen

**What:** After the last card is reviewed, show a detailed summary of the session before returning to the home screen.

**Summary includes:**
- Total cards reviewed
- Rating distribution: how many Again / Hard / Good / Easy
- Average pronunciation score (production mode only)
- Leeches encountered (cards with 5+ lapses reviewed this session)
- Words that were rated "Again" — listed so the user can see what they're struggling with
- Streak info: consecutive days with at least one review session
- Next due: when the next card will be ready for review

**Why this matters:** Immediate feedback on session performance helps learners calibrate self-assessment and identify weak spots. The list of "Again" words gives a concrete target for extra study. Streak tracking provides motivation through the "don't break the chain" effect (shown to increase habit formation in Lally et al., 2010).

**Implementation details:**
- Track session stats in a `useRef` during the review session:
  ```js
  const sessionStats = useRef({
    ratings: { [Rating.Again]: 0, [Rating.Hard]: 0, [Rating.Good]: 0, [Rating.Easy]: 0 },
    pronunciationScores: [],
    againWords: [],       // { word, pinyin, english }
    leechesReviewed: 0
  });
  ```
- Update in `handleRate`: increment the appropriate rating counter, push pronunciation score if available, collect "Again" words
- Replace the current "All done" screen (condition: `!currentCard && !waitingUntil && !loading`) with a richer summary component
- The existing `SessionSummary.jsx` component is for conversation sessions — create a separate `FlashcardSummary` section within FlashcardScreen or extract a shared summary pattern
- "Next due" calculation: query `getDueVocabulary` with a future date or query the minimum `due_date` from the DB
- Streak data: read from `user_settings.current_streak` (already tracked in the schema)

**Effort:** ~2 hours

---

## 5. Leech Intervention

**What:** When a card with 5+ lapses comes up for review, instead of just showing a small badge, offer an intervention screen with strategies to help the learner finally commit the word to memory.

**Intervention includes:**
- Word decomposition: break the word into individual characters with their meanings (e.g., 餐厅 → 餐 (meal) + 厅 (hall))
- Visual mnemonic hint: a short phrase connecting the characters to the meaning (could be generated by Claude on first leech encounter and cached)
- Tone pair highlight: show the tone pattern explicitly (e.g., "cān = 1st tone (flat), tīng = 1st tone (flat) — both high and flat")
- Context recall: show the original conversation exchange where this word was first introduced (query from `exchanges` table using `context_sentence`)
- Similar words: show words the user knows with shared characters (e.g., if leech is 餐厅, show 餐 also appears in 早餐 which they know)
- Option to "suspend" the card (stop showing it) if it's genuinely not useful

**Why this matters:** Leeches are the #1 source of frustration in SRS systems. Anki's research shows ~5-10% of cards become leeches and consume disproportionate review time without improvement. Simply showing the card more often (the "Again" loop) doesn't work for leeches — the learner needs a different encoding strategy. Breaking the word into components, providing mnemonics, and connecting to known words creates new retrieval pathways.

**Implementation details:**
- Check `currentCard.lapses >= 5` when displaying a card
- Show an expandable "Having trouble?" section on the card front (collapsed by default, not blocking normal review flow)
- Word decomposition: use the `cedict.txt` dictionary (already in `api/cedict.txt`) to look up individual characters. The dictionary has entries for single characters with definitions
- Mnemonic generation: could use a lightweight Claude call (Haiku) to generate a mnemonic on first leech encounter, then cache it in a new `mnemonic` field on `user_vocabulary`. Or generate a set of mnemonics in batch offline
- Similar word lookup: query `vocabulary` table for words containing any character from the leech word, cross-reference with `user_vocabulary` to find ones the user knows
- Suspend feature: add a `suspended` boolean to `user_vocabulary`, filter out suspended cards in `getDueVocabulary`
- The intervention should be optional and non-intrusive — don't force the user through it if they just want to rate and move on

**Effort:** ~3 hours for basic decomposition + suspend, ~5 hours with mnemonic generation and similar word lookup

---

## 6. Pinyin Typing Input

**What:** In recognition mode, instead of tap-to-reveal, show a text input where the user types the pinyin (with tone numbers or diacritics). Correct pinyin reveals the card; incorrect shows the error.

**Example:**
- Card shows: 餐厅
- User types: `canting1` or `cāntīng`
- Result: correct — reveal with green highlight. Or incorrect — show what was wrong (e.g., wrong tone: you typed `cánting`, correct is `cāntīng`)

**Why this matters:** Typing pinyin is active production, which creates stronger memory traces than passive recognition (the "generation effect" — Slamecka & Graf, 1978). It specifically targets tone accuracy, which is the single hardest aspect of Mandarin for most learners. Many learners can recognize a word visually but cannot produce its tones correctly — this mode catches that gap.

**Implementation details:**
- Add a `pinyin_input` option to card modes
- Show the Chinese characters on the front with a text input below
- Accept tone numbers (e.g., `can1ting1`) or tone diacritics (e.g., `cāntīng`) — normalize both to a canonical form for comparison
- Pinyin normalization: strip spaces, lowercase, convert tone numbers to diacritics (or vice versa). Libraries like `pinyin-utils` can help, or write a simple converter since the mapping is fixed
- Comparison logic: compare normalized user input against `currentCard.pinyin`. Be lenient on spacing and capitalization. Consider partial credit — correct sounds but wrong tones could auto-suggest a "Hard" rating
- On mobile (primary target): the text input may be awkward. Consider a tone-selection UI instead: show the pinyin without tones, let the user tap each syllable to cycle through tones 1-4. This is more touch-friendly and still tests tone knowledge
- Auto-reveal after correct input; show the error diff after incorrect input (highlight which syllable/tone was wrong in red)
- After reveal, standard rating buttons appear — but pre-suggest a rating based on correctness (Easy if correct first try, Again if incorrect)

**Effort:** ~4 hours with number-based input, ~6 hours with the tone-tap mobile UI

---

## Priority Recommendation

For maximum learning impact with minimum development effort:

1. ~~**Shuffle/interleave**~~ — ✓ DONE (implemented with dynamic scheduling overhaul)
2. **Session summary** — 2 hrs, improves motivation and self-awareness (note: dynamic scheduling already tracks `reviewed` count and queue state)
3. **Audio-only mode** — 2 hrs, fills a critical gap (listening comprehension)
4. **Cloze sentences** — 3 hrs, highest retention impact per the research
5. **Leech intervention** — 3-5 hrs, helps the frustrated learner
6. **Pinyin typing** — 4-6 hrs, most effort but uniquely targets tone production
