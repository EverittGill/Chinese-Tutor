# Plan: Fix Speech Detection & Inconsistent Word Breakdown

## Context
Testing revealed two high-priority bugs that make the app frustrating to use:
1. Azure STT drops recognized speech — user sees characters while holding the mic but gets "No speech detected" on release
2. Claude inconsistently provides word-by-word breakdown — some AI/user bubbles render as plain text with no pinyin

Also: `api/chat.js` (Vercel serverless) is out of sync with `server.js` (missing `user_english` field added earlier).

---

## Bug 1: Azure STT Race Condition

### Root Cause
`stopContinuousRecognitionAsync` fires its success callback BEFORE the final `recognized` event arrives. With pronunciation assessment, Azure needs 100-500ms extra to compute scores. The callback sees empty `accumulatedRef.current.text` and reports "No speech detected" — even though interim text was visible on screen.

### Fix: Deferred harvesting + interim fallback

**File: `src/hooks/useAzureSpeech.js`**

1. Add `lastInterimRef` and `stoppingRef` refs (near line 141)
2. Update `recognizing` handler to save interim text to `lastInterimRef`
3. Rewrite `stopListening`:
   - Call `stopContinuousRecognitionAsync`
   - In the success callback, wait **800ms** for pending `recognized` events to flush
   - After wait: if `accumulatedRef.current.text` has content → use it (normal path with pronunciation scores)
   - If empty but `lastInterimRef` has content → use interim text as fallback (no pronunciation scores, but speech isn't lost)
   - If both empty → show "No speech detected"
   - Add `stoppingRef` guard to prevent double-stop on mobile

### Why 800ms?
Pronunciation assessment adds 100-500ms network latency. 800ms gives margin while still feeling responsive. Can tune down to 500ms if testing shows faster flush.

---

## Bug 2: Claude Omitting Word Breakdown

### Root Cause
Claude's `required` fields in tool schemas are advisory, not enforced. Short responses (e.g., "好的") are most likely to skip the `words` array. No validation or retry exists.

### Fix: Three-layer defense

**Layer 1 — Strengthen prompt** (`src/utils/claudePrompt.js`)
- Add to both `getSystemPrompt` and `getReviewSystemPrompt` after WORD BREAKDOWN RULES:
  ```
  CRITICAL: ALWAYS include "words" and "user_words" arrays, even for one-word responses like "好的". Omitting breaks the app.
  ```

**Layer 2 — Server-side validation + retry** (`server.js` AND `api/chat.js`)
- After extracting `toolBlock.input`, check if `words` is missing/empty
- If missing: send a `tool_result` with `is_error: true` asking Claude to redo it with the words array
- Retry once, then accept whatever comes back
- This uses the documented Anthropic API pattern for rejected tool calls

**Layer 3 — Client-side fallback** (`src/components/ChatBubble.jsx`)
- AI bubble: if `words` is empty but `response` + `pinyin` exist, render as `<ruby>` with pinyin above (not clickable, but pinyin is visible)
- User bubble: if `userWords` is empty but `userPinyin` exists, render text with pinyin as `<ruby>` block

---

## Bonus: Sync `api/chat.js` with `server.js`
- Add `user_english` field to tool schema in `api/chat.js` (was added to `server.js` but not the Vercel endpoint)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useAzureSpeech.js` | Bug 1: rewrite stopListening with 800ms delay + interim fallback |
| `src/utils/claudePrompt.js` | Bug 2 Layer 1: strengthen prompt in both system prompt functions |
| `server.js` | Bug 2 Layer 2: add validation + retry after tool response |
| `api/chat.js` | Bug 2 Layer 2: same validation + retry; also add `user_english` to schema |
| `src/components/ChatBubble.jsx` | Bug 2 Layer 3: ruby fallback for missing words array |

## Implementation Order
1. Bug 1 (useAzureSpeech.js) — standalone, no dependencies
2. Bug 2 Layer 1 (claudePrompt.js) — quick prompt change
3. Bug 2 Layer 2 (server.js + api/chat.js) — validation + retry + sync user_english
4. Bug 2 Layer 3 (ChatBubble.jsx) — UI fallback

## Verification
1. Restart dev server (server.js changes need restart)
2. Hard refresh browser
3. **Test Bug 1:** Hold mic, say "你好" quickly, release fast. Should capture text instead of "No speech detected". Check console for `[Azure STT] Using interim text as fallback` if the fallback path fires.
4. **Test Bug 2:** Have a conversation, check that ALL AI bubbles show pinyin above characters (never plain text). Check server logs for `[chat] Missing words array` retry messages.
5. Longer conversation (5+ turns) to verify consistency
