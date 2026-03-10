# Plan: Fix Speech Detection & Word Breakdown Bugs — Implementation

## Context

Two high-priority bugs make the app frustrating to use:
1. **Bug 1**: User sees their Chinese text on screen while speaking, releases the mic, and gets "No speech detected" — their speech is thrown away
2. **Bug 2**: Some AI/user chat bubbles render as plain text with no pinyin because Claude sometimes omits the `words` array

Also: `api/chat.js` (Vercel) is missing the `user_english` field that `server.js` already has.

---

## Bug 1: Azure STT Race Condition

### Root Cause (traced through code)

In `src/hooks/useAzureSpeech.js`, the `stopContinuousRecognitionAsync` success callback (line 253) fires BEFORE the final `recognized` event (line 194) arrives. With pronunciation assessment enabled, Azure needs 100-500ms extra to compute per-word scores. The callback reads `accumulatedRef.current.text` (line 258), finds it empty, and reports "No speech detected" (line 275) — even though interim text was visible on screen.

Timeline:
```
recognizer.recognizing → interimText shown on screen (line 187-191)
User releases mic → stopContinuousRecognitionAsync() called (line 252)
  → stop callback fires IMMEDIATELY (line 253)
  → reads accumulatedRef.current.text → "" → "No speech detected"
...200-500ms later...
recognizer.recognized would have fired (line 194-222) → too late, recognizer closed
```

### Fix: Three-path stop logic

Changes to `src/hooks/useAzureSpeech.js`:

1. **Add two refs** near line 141:
   - `lastInterimRef = useRef('')` — tracks latest full interim text (accumulated + partial)
   - `stoppingRef = useRef(false)` — prevents double-stop on mobile

2. **Update `recognizing` handler** (line 187): also write to `lastInterimRef.current = accumulatedRef.current.text + e.result.text`

3. **Reset both refs in `startListening`** (line 155): clear alongside `accumulatedRef`

4. **Rewrite `stopListening`** (lines 245-286) with three paths:

   ```
   stopContinuousRecognitionAsync callback:

   Path A: accumulatedRef.text has content
     → recognized event already fired before stop
     → harvest immediately with full pronunciation data
     → NO DELAY — this is the happy path

   Path B: accumulatedRef.text empty BUT lastInterimRef has content
     → recognized event is still in-flight (pronunciation scoring)
     → wait 800ms, then check accumulatedRef again
       → if now has content → harvest with pronunciation data
       → if still empty → use lastInterimRef text as fallback (no pronunciation scores)
     → 800ms covers 100-500ms pronunciation latency with margin

   Path C: both empty
     → user didn't actually speak
     → show "No speech detected" error immediately
   ```

5. **Track timeout for cleanup**: store timeout ID in a ref, clear in unmount effect (line 288-295)

### Key details
- Extract the harvest logic into a helper function to avoid duplication between Path A and Path B
- `stoppingRef` check at top of `stopListening`, set true on entry, reset when done
- Clear `lastInterimRef` in `startListening` alongside `accumulatedRef`
- When using interim fallback (Path B, no recognized event): set `recognizedText` and increment `turnId` but do NOT set `pronunciationData` (no scores available)

---

## Bug 2: Claude Omitting Word Breakdown

### Root Cause

`server.js` line 79 and `api/chat.js` line 71 list `words` in the `required` array, but the Anthropic API does not reject tool responses that omit required fields. Claude sometimes skips the `words` array for short responses like "好的".

In `ChatBubble.jsx` line 94: `words && words.length > 0` → false → falls through to plain `aiResponse.response` text (line 105). No pinyin, no clickable words.

### Fix: Two layers

**Layer 1 — Strengthen prompt** (`src/utils/claudePrompt.js`)

Add after WORD BREAKDOWN RULES section in both `getSystemPrompt` (after line 44) and `getReviewSystemPrompt` (after line 112):

```
CRITICAL: You MUST ALWAYS include "words" and "user_words" arrays, even for one-word responses like "好的". Every response needs a word-by-word breakdown. Omitting these breaks the UI.
```

**Layer 2 — Client-side `<ruby>` fallback** (`src/components/ChatBubble.jsx`)

AI bubble (lines 94-106) — add middle fallback:
```
words array exists → ClickableWord per word (current)
words missing BUT response + pinyin exist → <ruby>{response}<rp>(</rp><rt>{pinyin}</rt><rp>)</rp></ruby>
both missing → '' (current)
```

User bubble (lines 44-62) — add `<ruby>` path:
```
userWords exists → ClickableWord per word (current)
wordScores exists → PronunciationWord per word (current)
both missing BUT userPinyin exists → <ruby>{text}<rp>(</rp><rt>{userPinyin}</rt><rp>)</rp></ruby>
text only → plain text (current)
```

### Why NOT server-side retry
- Requires restructuring endpoints for multi-turn tool_use → tool_result exchange
- Doubles API latency and cost
- Client `<ruby>` fallback already solves the user-facing problem

---

## Bonus: Sync `api/chat.js` with `server.js`

`server.js` line 51 has `user_english` in schema properties. `api/chat.js` is missing it entirely.

Add to `api/chat.js`:
- Property: `user_english: { type: "string", description: "Natural English translation of what the user said" }` (after `user_pinyin`, around line 43)
- Add `"user_english"` to the `required` array (line 71)

---

## Files to Modify

| File | What changes |
|------|-------------|
| `src/hooks/useAzureSpeech.js` | Add `lastInterimRef` + `stoppingRef`, rewrite `stopListening` with three-path logic, update cleanup |
| `src/utils/claudePrompt.js` | Add CRITICAL instruction about `words`/`user_words` to both system prompt functions |
| `src/components/ChatBubble.jsx` | Add `<ruby>` fallback in AI bubble and user bubble |
| `api/chat.js` | Add `user_english` property + required entry |

## Implementation Order

1. `useAzureSpeech.js` — standalone, no dependencies
2. `claudePrompt.js` — two-line addition to each prompt
3. `ChatBubble.jsx` — add `<ruby>` fallback paths
4. `api/chat.js` — copy `user_english` from server.js

## Verification

1. Restart dev server (server.js changes need restart)
2. Hard refresh browser
3. **Bug 1**: Hold mic, say "你好" quickly, release fast. Should capture text. Check console for `[Azure STT]` logs. Try 5+ times.
4. **Bug 2**: Have 5+ turn conversation. Every AI bubble should show pinyin. Short responses like "好的" should not be plain text.
5. **Vercel sync**: Deploy, verify `user_english` appears in user bubbles.
