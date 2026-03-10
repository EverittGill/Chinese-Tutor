# Feature 05: Sentence Shadowing Mode

> **Type:** Standalone feature — new screen with nav button
> **Complexity:** Medium
> **Prerequisites:** Feature 02 (TTS Speed — uses `speak(text, rate)`) for progressive speed ramp
> **Research basis:** Section 1.6 (Shadowing Technique), Section 6.1 (P2 but high-value for pronunciation), Section 3.4 (Multi-Modal Input), Section 5.2 (Contextual Learning)

---

## What It Does

A dedicated practice mode where the user listens to a model Chinese sentence, then repeats it while holding the mic, and gets word-level pronunciation feedback comparing their attempt to the target. This is the **shadowing technique** — one of the most effective methods for improving pronunciation and fluency, confirmed by a 2025 systematic review.

### Why Shadowing Works (from the research)

- Enhances speech perception and phonemic discrimination
- Increases working memory capacity
- Strengthens the motor-auditory loop (hear → produce → compare)
- Eight-week shadowing interventions show statistically significant improvement in fluency, pronunciation, and communicative competence
- Particularly valuable for Mandarin tone practice

### Where Sentences Come From

The app already generates practice material:

1. **Practice sentences** from `SessionSummary.jsx` — Claude generates `practice_sentences: [{chinese, pinyin, english, focus}]` at the end of each conversation. Stored in `sessions.summary_json`.
2. **Corrections** from conversation — stored in `sessions.corrections_json` with `corrected` text. These are sentences the user got wrong, making them ideal shadowing targets.

Both are pulled from the last 10 sessions, deduplicated, and limited to 15 per shadowing session.

## How It Looks (iPhone 13 Pro Max)

### Access Point — TopicSelector Nav

```
┌──────────────────────────────────────┐
│ [📚 Vocabulary ] [📊 Progress  ]     │
│ [🗂️ Flashcards ] [🎯 Shadowing ]     │
└──────────────────────────────────────┘
```

### LISTEN Phase

```
┌──────────────────────────────────────┐
│ ← Back                      1 / 12   │
│                                      │
│    ┌──────────────────────────────┐  │
│    │ TARGET SENTENCE              │  │
│    │                              │  │
│    │ 我想去商店买一些东西           │  │
│    │ wǒ xiǎng qù shāngdiàn       │  │
│    │ mǎi yīxiē dōngxi            │  │
│    │ I want to go to the store    │  │
│    │ to buy some things           │  │
│    │                              │  │
│    │ 🔊 Listen Again              │  │
│    └──────────────────────────────┘  │
│                                      │
│                                      │
│                                      │
│         [ Ready to Record ]          │
│                                      │
└──────────────────────────────────────┘
```

Auto-plays sentence at **0.7x speed** on first appearance (progressive speed ramp from research). User can tap "Listen Again" for manual replay.

### RECORD Phase

```
┌──────────────────────────────────────┐
│ ← Back                      1 / 12   │
│                                      │
│    ┌──────────────────────────────┐  │
│    │ TARGET SENTENCE              │  │
│    │ 我想去商店买一些东西           │  │
│    │ wǒ xiǎng qù shāngdiàn ...   │  │
│    │ 🔊 Listen Again              │  │
│    └──────────────────────────────┘  │
│                                      │
│        我想去...                     │
│        (interim text, italic)        │
│                                      │
│           Hold to speak...           │
│                                      │
│             ┌──────┐                 │
│             │  🎤  │                 │
│             │      │                 │
│             └──────┘                 │
│                                      │
└──────────────────────────────────────┘
```

Same hold-to-talk mic as conversation screen. Target sentence stays visible for reference.

### COMPARE Phase

```
┌──────────────────────────────────────┐
│ ← Back                      1 / 12   │
│                                      │
│    ┌──────────────────────────────┐  │
│    │ TARGET SENTENCE              │  │
│    │ 我想去商店买一些东西           │  │
│    │ 🔊 Listen Again              │  │
│    └──────────────────────────────┘  │
│                                      │
│    ┌──────────────────────────────┐  │
│    │ YOUR ATTEMPT                 │  │
│    │                              │  │
│    │ 我 想 去 商店 买 一些 东西     │  │
│    │ grn grn grn ylw  grn grn grn │  │
│    │                              │  │
│    │ 82/100 accuracy · 75/100 flu │  │
│    └──────────────────────────────┘  │
│                                      │
│    ┌──────────┐  ┌──────────┐       │
│    │ Try Again │  │   Next   │       │
│    └──────────┘  └──────────┘       │
│                                      │
└──────────────────────────────────────┘
```

Word-level color coding uses the same green/yellow/red scheme as Feature 01 for consistency. Aggregate accuracy and fluency scores shown below.

### Progressive Speed on Retry

When user taps "Try Again":
1. Target sentence replays at **1.0x speed** (faster than initial 0.7x)
2. User records again
3. New scores replace old ones

This progressive speed ramp (0.7x → 1.0x) follows the research recommendation: build comprehension at slow speed, then challenge with natural speed.

### "Hear Model" Button in COMPARE Phase

A "Hear Model" button appears in the COMPARE phase so the user can immediately compare what they heard themselves say vs. the correct pronunciation. This exploits the motor-auditory loop the research describes.

### Complete Screen

```
┌──────────────────────────────────────┐
│         Shadowing Complete!          │
│                                      │
│        ┌────────────────────┐        │
│        │        12          │        │
│        │ sentences practiced │        │
│        │                    │        │
│        │  78% avg accuracy  │        │
│        └────────────────────┘        │
│                                      │
│     [ Back to Topics ]               │
└──────────────────────────────────────┘
```

### Empty State (No Practice Data Yet)

```
┌──────────────────────────────────────┐
│         No practice sentences        │
│         available yet.               │
│                                      │
│  Complete a conversation session     │
│  first to generate practice          │
│  material.                           │
│                                      │
│     [ Back to Topics ]               │
└──────────────────────────────────────┘
```

## Phase State Machine

```
                    ┌──────────────────┐
                    │                  │
   ┌──── LISTEN ───→ "Ready to Record"│
   │     (auto-play │                  │
   │      at 0.7x)  └────────┬─────────┘
   │                          │
   │                          ▼
   │                    ┌──────────────┐
   │                    │    RECORD    │
   │                    │ (hold mic)   │
   │                    └──────┬───────┘
   │                           │ speech recognized
   │                           ▼
   │                    ┌──────────────┐
   │  "Try Again" ──────│   COMPARE   │
   │  (replay at 1.0x)  │ (show scores)│
   │                    └──────┬───────┘
   │                           │ "Next"
   │                           ▼
   └──── LISTEN (next sentence, 0.7x)

   Last sentence "Next" → DONE (summary)
```

## Critical Implementation Detail: Stale Turn Prevention

The `useAzureSpeech` hook uses `turnId` to signal new speech input. When "Try Again" sets phase back to RECORD, the previous `turnId` and `recognizedText` are still in state. A `useEffect` watching these would re-fire immediately and skip back to COMPARE.

**Solution:** Track the last processed turn in a ref:

```js
const lastProcessedTurn = useRef(0);

useEffect(() => {
  if (turnId > lastProcessedTurn.current && recognizedText && phase === 'RECORD') {
    lastProcessedTurn.current = turnId;
    setPhase('COMPARE');
    // process pronunciation data...
  }
}, [turnId, recognizedText, phase, pronunciationData]);
```

## Integration Points

| Component | How It's Used |
|-----------|--------------|
| `useAzureSpeech` | Same speech recognition hook as ConversationScreen. Provides `recognizedText`, `turnId`, `pronunciationData`, `isListening`, `startListening`, `stopListening`. |
| `useAzureTTS` | `speak(text, rate)` — uses Feature 02's rate parameter. 0.7x for first listen, 1.0x for retries. |
| `db.js` / `localDb.js` | `getShadowingSentences()` pulls from sessions table. `updateWordStats()` updates pronunciation stats per word. |
| Feature 01 color scheme | Same green/yellow/red thresholds (>=80, >=60, <60) for word-level display. |
| Feature 02 TTS speed | Uses the `rate` parameter on `speak()`. Does NOT use the global `ttsSpeed` state from ConversationScreen — shadowing has its own speed logic. |

## New Files

### `src/components/ShadowingScreen.jsx`

Full component (~250 lines). Key structure:

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { getShadowingSentences, updateWordStats } from '../utils/db';
import useAzureSpeech from '../hooks/useAzureSpeech';
import useAzureTTS from '../hooks/useAzureTTS';

export default function ShadowingScreen({ onBack }) {
  // State: sentences, currentIndex, phase ('LISTEN'|'RECORD'|'COMPARE'),
  //        loading, attempts, stats
  // Ref: lastProcessedTurn

  // Effect: load sentences on mount
  // Effect: auto-play TTS at 0.7x when entering LISTEN phase
  // Effect: process speech recognition results (with stale turn guard)

  // Handlers: handleReady, handleMicDown/Up, handleTryAgain, handleNext

  // Render: header, target card, attempt card (COMPARE), mic (RECORD),
  //         ready button (LISTEN), navigation buttons (COMPARE)
}
```

**On "Try Again":**
1. Increment attempts counter
2. Play target sentence at 1.0x speed
3. Set phase to RECORD

**On "Next":**
1. Increment currentIndex
2. Reset attempts to 0
3. Set phase to LISTEN (which triggers auto-play at 0.7x)

**Word-level scoring display in COMPARE:**
```jsx
{pronunciationData.words?.map((w, i) => {
  const color = w.accuracyScore >= 80 ? 'text-green-400'
    : w.accuracyScore >= 60 ? 'text-yellow-400'
    : 'text-red-400';
  const border = w.accuracyScore >= 80 ? 'border-green-400'
    : w.accuracyScore >= 60 ? 'border-yellow-400'
    : 'border-red-400';
  return (
    <span key={i} className={`${color} border-b-2 ${border} px-1 py-0.5 text-lg`}>
      {w.word}
    </span>
  );
})}
```

## Modified Files

### `src/utils/db.js`

Append:
```js
// Shadowing

export async function getShadowingSentences(limit = 15) {
  if (!useSupabase()) return local.getShadowingSentences(limit);
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('sessions')
    .select('summary_json, corrections_json')
    .not('summary_json', 'is', null)
    .order('started_at', { ascending: false })
    .limit(10);
  if (error) { console.error('getShadowingSentences:', error); return []; }

  const sentences = [];
  const seen = new Set();

  for (const session of (data || [])) {
    // Practice sentences from session summaries
    if (session.summary_json?.practice_sentences) {
      for (const s of session.summary_json.practice_sentences) {
        if (s.chinese && !seen.has(s.chinese)) {
          seen.add(s.chinese);
          sentences.push({
            chinese: s.chinese,
            pinyin: s.pinyin || '',
            english: s.english || '',
            source: 'practice'
          });
        }
      }
    }
    // Corrected sentences — things the user got wrong
    if (session.corrections_json) {
      for (const c of session.corrections_json) {
        if (c.corrected && !seen.has(c.corrected)) {
          seen.add(c.corrected);
          sentences.push({
            chinese: c.corrected,
            pinyin: c.pinyin || '',
            english: c.explanation || '',
            source: 'correction'
          });
        }
      }
    }
  }

  return sentences.slice(0, limit);
}
```

### `src/utils/localDb.js`

Same logic adapted for localStorage:
```js
export async function getShadowingSentences(limit = 15) {
  const sessions = getStore('mt_sessions')
    .filter(s => s.summary_json)
    .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
    .slice(0, 10);
  // ... same dedup logic as above
}
```

### `src/App.jsx`

Add import and route:
```js
import ShadowingScreen from './components/ShadowingScreen';

if (screen === 'shadowing') {
  return <ShadowingScreen onBack={() => setScreen('topics')} />;
}
```

### `src/components/TopicSelector.jsx`

Add Shadowing button to the 2x2 nav grid:
```jsx
<button
  onClick={() => onNavigate('shadowing')}
  className="bg-slate-800 hover:bg-slate-700 rounded-xl p-3 text-center transition-colors cursor-pointer"
>
  <span className="text-lg mr-1">🎯</span>
  <span className="text-sm text-slate-300">Shadowing</span>
</button>
```

## Per-Sentence Progress Tracking (Lightweight)

To avoid re-practicing sentences the user has already mastered, track a simple score per sentence. When the user completes a sentence in shadowing:

- If accuracy >= 80: mark as "practiced" (don't show again for 7 days)
- If accuracy < 80: keep in rotation

This is stored in localStorage only (not worth a database table):
```js
// Key: 'mt_shadowing_scores'
// Value: { [chineseSentence]: { bestScore: 85, lastPracticed: '2026-03-09T...' } }
```

`getShadowingSentences` filters out sentences that were practiced with score >= 80 within the last 7 days.

## Verification

1. `npx vite build` — no errors
2. **No data state:** Navigate to Shadowing before any conversations. Shows "No practice sentences available yet."
3. **Generate data:** Complete a conversation (3-4 turns, tap Finish). Session summary generates practice sentences.
4. **With data:** Navigate to Shadowing. Sentences load from session history.
5. Target sentence displays and auto-plays TTS at ~0.7x speed.
6. Tap "Listen Again" — replays sentence.
7. Tap "Ready to Record" — mic button appears.
8. Hold mic, speak the sentence, release — transitions to COMPARE.
9. COMPARE shows word-by-word color coding (green/yellow/red) + aggregate scores.
10. Tap "Hear Model" — plays target sentence at normal speed for comparison.
11. Tap "Try Again" — target replays at 1.0x, returns to RECORD phase.
12. Tap "Next" — advances to next sentence, auto-plays at 0.7x.
13. Complete all sentences — summary with count and average accuracy.
14. **Regression:** All previous features still work (conversation, word coloring, TTS speed, flashcards).
