# Word Translation & Hover Dictionary — Research & Plan

## The Problem

When you tap/hover a Chinese word in the conversation, the popover often shows wrong, missing, or unhelpful translations. Specific issues:

1. **Missing translations**: Intl.Segmenter groups words (e.g. "我也") that aren't in the CC-CEDICT dictionary → popover shows pinyin twice instead of a translation
2. **Wrong pinyin**: `pinyin-pro` library mishandles erhua — "哪儿" renders as "nǎěr" instead of correct "nǎr"
3. **Wrong definition selected**: CEDICT stores multiple entries per character. Current code takes the first one: "也" → "surname Ye" instead of "also; too"; "吗" → "má (what?)" instead of "ma (question particle)"; "了" → "liǎo (to finish)" instead of "le (completed action)"
4. **Context-free translations**: Dictionary can't know that "不过" means "however; but" in context vs "only; merely" (its first definitions)
5. **CEDICT syntax leaks into display**: Raw notation like `CL:個|个[ge4]` and `[nin2]` appears in hover text

## Current Architecture (How It Works Today)

### Data Flow
```
Claude API (tool_use) returns: { response, english, corrections, new_vocabulary, user_english }
  ↓
Server post-processes (api/chat.js lines 94-105):
  result.words = segmentAndAnnotate(result.response)     ← THIS IS THE PROBLEM AREA
  result.pinyin = generatePinyin(result.response)
  result.user_words = segmentAndAnnotate(userChinese)
  result.user_pinyin = generatePinyin(userChinese)
  ↓
Frontend renders each word as <ClickableWord> with { chinese, pinyin, english }
  ↓
Tap shows popover: english definition + pinyin + pronunciation score
```

### segmentWords.js (the problematic module)
- **Segmentation**: `Intl.Segmenter('zh', { granularity: 'word' })` — built-in Node.js ICU-based word splitter
- **Pinyin**: `pinyin-pro` npm package — generates tone-marked pinyin per word
- **Dictionary**: `cedict.txt` (124K entries, 9.4MB) — parsed into `Map<simplified, english>` at startup
- **Lookup**: For each segment, look up in CEDICT map. If not found, english is empty string.
- **Popover fallback**: When english is empty, `ClickableWord.jsx` line 38 shows `word.pinyin` as the "english" line → user sees pinyin displayed twice

### Key Files
| File | Role |
|------|------|
| `api/chat.js` | Claude API call + post-processing with segmentWords |
| `api/segmentWords.js` | Intl.Segmenter + pinyin-pro + CEDICT lookup |
| `api/cedict.txt` | CC-CEDICT dictionary (124K entries) |
| `src/components/ClickableWord.jsx` | Renders individual word + popover on tap |
| `src/components/ChatBubble.jsx` | Maps word arrays → ClickableWord components |
| `src/utils/claudePrompt.js` | System prompts (3 modes: normal, teacher, review) |

## What Was Attempted (and Failed)

### Attempt 1: CEDICT-based forward maximum matching
Replaced Intl.Segmenter with dictionary-based greedy matching. Problems:
- Over-matched: "我去" → slang "what the...!" instead of "I go"
- Still context-free translations

### Attempt 2: Hybrid (Intl.Segmenter + CEDICT sub-segmentation fallback)
Used Intl.Segmenter as primary, with CEDICT max-matching as fallback when segments not found. Also added:
- CEDICT pinyin (numbered→tone mark conversion) instead of pinyin-pro
- Entry scoring to prefer common words over surnames
- Neutral tone boost for particles
- Definition cleanup (strip CL: and [pinyin] notation)

**Result**: Character-by-character segmentation in practice — much worse than original. The sub-segmentation was too aggressive and the punctuation handling broke word groupings.

### Key Lesson
Local dictionary-based translation is fundamentally limited. Every fix creates new edge cases. The problem isn't one bug — it's that context-free dictionary lookup can't produce good translations for a tonal, contextual language like Chinese.

## The Recommended Plan

### Primary: Have Claude provide word breakdowns in its existing API call

We already pay for a Claude Sonnet 4.6 call every exchange. Claude already understands the sentences. We just need to ask it to include word-by-word breakdowns.

**Changes needed:**

#### 1. Revert broken changes
```bash
git checkout HEAD -- mandarin-trainer/api/segmentWords.js mandarin-trainer/src/components/ClickableWord.jsx mandarin-trainer/src/index.css
```

#### 2. Add `words` and `user_words` to tool schema (`api/chat.js`)
Add to `conversationTools[0].input_schema.properties`:
```js
words: {
  type: "array",
  description: "Word-by-word breakdown of your Chinese response. Attach trailing punctuation to preceding word's chinese field.",
  items: {
    type: "object",
    properties: {
      chinese: { type: "string", description: "Chinese characters (with trailing punctuation if any)" },
      pinyin: { type: "string", description: "Pinyin with tone marks, correct erhua (哪儿→nǎr), neutral tone for particles (了→le, 吗→ma)" },
      english: { type: "string", description: "Contextual English meaning in this sentence, 1-3 short definitions separated by semicolons" }
    },
    required: ["chinese", "pinyin", "english"]
  }
},
user_words: {
  type: "array",
  description: "Word-by-word breakdown of what the user said in Chinese. Empty array if no Chinese input.",
  items: { /* same item schema as words */ }
}
```
Add both to the `required` array.

#### 3. Update server post-processing (`api/chat.js`)
Use Claude's arrays when provided, fall back to local segmentation if missing:
```js
if (!Array.isArray(result.words) || result.words.length === 0) {
  result.words = segmentAndAnnotate(result.response);
}
result.pinyin = result.words.map(w => w.pinyin).join(' ');

if (!Array.isArray(result.user_words) || result.user_words.length === 0) {
  const userChinese = extractUserChinese(messages);
  result.user_words = userChinese ? segmentAndAnnotate(userChinese) : [];
}
result.user_pinyin = result.user_words.map(w => w.pinyin).join(' ');
```
Bump `max_tokens` from 1024 → 1500 to accommodate extra output.

#### 4. Add word breakdown instructions to system prompts (`src/utils/claudePrompt.js`)
Add to all three prompt functions (getSystemPrompt, getTeacherSystemPrompt, getReviewSystemPrompt):
```
WORD BREAKDOWN RULES:
- "words" breaks down your entire Chinese response word-by-word
- "user_words" breaks down the user's Chinese input (empty array if none)
- Segment at natural word boundaries for an HSK 2-3 learner
- Attach trailing punctuation (。，！？) to the preceding word's chinese field
- Pinyin: tone marks, correct erhua (哪儿→nǎr), neutral tone for particles (了→le, 的→de)
- English: contextual meaning in THIS sentence, not exhaustive dictionary definitions
- Every character must appear in exactly one word entry
```

#### 5. Fix ClickableWord popover (original bug)
Line 38 of ClickableWord.jsx: when `word.english` is empty, don't show pinyin as the "english" line. Only show the english span when it has content.

### Secondary: Improve the local fallback (segmentWords.js)

The local CEDICT fallback should be improved but not rewritten. Targeted fixes only:

1. **Better CEDICT entry selection**: When multiple entries exist for a word, prefer non-surname entries (check if pinyin starts with capital letter). For single characters, prefer neutral-tone (tone 5) readings — these are always the common particle readings (了le, 吗ma, 呢ne, 的de, 吧ba).

2. **CEDICT pinyin instead of pinyin-pro for known words**: Parse CEDICT's numbered pinyin (e.g. `[na3 r5]`) and convert to tone marks (`nǎr`). This fixes erhua. Only fall back to pinyin-pro for words not in CEDICT.

3. **Clean CEDICT syntax from definitions**: Strip `CL:...` classifier references and `[pinyin]` bracketed references before displaying.

4. **Fix popover when no english**: Same as step 5 above — don't show pinyin twice.

These are the specific improvements from my earlier session that actually worked correctly in isolation. They should be applied carefully without changing the segmentation algorithm itself.

## Cost Analysis
- Extra output tokens per exchange: ~300-500 (15-25 words × ~15 tokens each)
- At Sonnet 4.6 pricing ($15/M output): ~$0.005 per exchange
- Negligible for personal use

## Latency Consideration
- ~400 extra tokens at ~100 tok/s = ~4 seconds additional wait
- This is the main tradeoff — response takes longer to complete
- Could be mitigated later with streaming (TTS starts on `response` field while `words` still generating)

## What NOT To Do
- Don't replace Intl.Segmenter with forward maximum matching — it over-matches (我去 → slang)
- Don't try to make CEDICT context-aware — it's a dictionary, not a translator
- Don't add a separate Haiku API call — just extend the existing Sonnet call
- Don't delete segmentWords.js — keep it as fallback
