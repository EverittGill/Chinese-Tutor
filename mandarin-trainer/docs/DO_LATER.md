# DO LATER: Move Translation/Segmentation Off the LLM

## Problem
Claude is currently responsible for both **creative work** (conversation, corrections, teaching) and **mechanical translation** (pinyin, word segmentation, word-by-word breakdowns). The mechanical work is what's unreliable — Claude sometimes omits `words[]`, `user_words[]`, `user_pinyin`, or returns incomplete breakdowns. This breaks the UI and learning experience.

## Core Insight
Chinese → pinyin conversion and word segmentation are **deterministic, solved problems**. They don't need an LLM. Offloading them would make the app more reliable AND free Claude to focus on being a better conversation partner.

## What Claude Does Today (per turn)

### Creative work (NEEDS an LLM)
- Generate a conversational Chinese response
- Identify corrections to user's speech
- Decide what new vocabulary to introduce
- Provide natural English translations (`english`, `user_english`)

### Mechanical work (does NOT need an LLM)
- `pinyin` — pinyin for its own response
- `user_pinyin` — pinyin for user's input
- `words[]` — segment response into words + pinyin + English per word
- `user_words[]` — segment user input into words + pinyin + English per word

## Proposed Approaches

### Option A: Full Separation (Recommended)
Claude's tool schema shrinks to just:
```
response, english, user_english, corrections, new_vocabulary
```
Server-side post-processing generates `pinyin`, `user_pinyin`, `words[]`, `user_words[]` deterministically.

**Benefits:**
- Word breakdowns become 100% reliable (no more missing `words[]`)
- Claude responds faster (fewer output tokens)
- Lower token cost per turn
- Simpler prompt (~30 lines of breakdown instructions removed)
- Claude focuses purely on conversation quality

**Tradeoff:**
- Dictionary-based English definitions are more "textbook" than LLM-generated contextual ones
- But for word-by-word breakdowns, consistency > contextual flair

### Option B: Hybrid Approach
Claude still returns `pinyin` + `english` (simple strings, usually reliable). Server only generates the word-by-word breakdowns (`words[]`, `user_words[]`) — the unreliable part.

### Option C: Keep Claude, Add Validation
Keep current schema but add server-side validation. If Claude omits `words[]`, generate them as fallback. Most conservative, least disruption.

### Option D: Two-Call Approach
First call: Claude does conversation (response + corrections). Second call: cheaper/faster model or library does all translation. Most flexible but adds latency.

## Libraries to Investigate

| Library | Purpose | Notes |
|---------|---------|-------|
| `pinyin-pro` | Chinese → pinyin with tone marks | Word-aware, handles polyphonic characters |
| `chinese-tokenizer` | Word segmentation + dictionary lookup | Uses CC-CEDICT, gives pinyin + English per word |
| `segmentit` | Pure JS Chinese segmentation | Lighter weight alternative |
| `nodejieba` | Node.js jieba bindings | C++ native — may not work in Vercel serverless |

## Key Questions to Resolve Before Implementation
1. Does `chinese-tokenizer` or `pinyin-pro` work in Vercel serverless (bundle size, native deps)?
2. How good is dictionary-based English vs. LLM-generated English for word definitions?
3. Should `english` and `user_english` (full sentence translations) stay with Claude or also move to a translation library?
4. How to handle words not in CC-CEDICT (names, slang, newer terms)?
5. Does this affect the review mode / flashcard flow at all?

## Files That Would Change
- `api/chat.js` — simplified tool schema, add post-processing step
- `src/utils/claudePrompt.js` — remove ~30 lines of breakdown instructions
- `server.js` — same changes as chat.js for local dev
- `src/hooks/useConversation.js` — may need to merge LLM response + server-generated breakdowns
- `ChatBubble.jsx` — fallback logic may simplify since breakdowns are always present
