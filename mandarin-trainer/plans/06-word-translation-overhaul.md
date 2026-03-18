# Plan 06: Word Translation & Segmentation Overhaul

**Status**: Complete
**Date**: 2025-03-18

## Problem

The word-by-word translation system had three major issues:

1. **Over-segmented words**: The original `segmentWords.js` used only `Intl.Segmenter` + `pinyin-pro` for segmentation and pinyin. While segmentation was decent, the pinyin was wrong for erhua (哪儿 → "nǎěr" instead of "nǎr"), and CEDICT definitions were picked poorly (了 → "to finish" instead of "le, particle").

2. **First attempt at fixing** (`WORD_TRANSLATION_PLAN.md`): Tried having Haiku do *everything* — word segmentation, pinyin, AND English translations in `translateWords.js`. Haiku was bad at Chinese segmentation, inconsistently splitting multi-character words (高兴 → 高 + 兴). Since each word renders as a `<ClickableWord>` with `margin-right: 0.35em`, over-segmented characters created visible gaps.

3. **Context-free translations**: Pure CEDICT lookup can't know that 不过 means "however" in one context vs "only" in another.

## Solution

Split responsibilities to use each tool for what it's best at:

| Responsibility | Tool | Why |
|---------------|------|-----|
| Word segmentation | `Intl.Segmenter` + CEDICT sub-segmentation | Deterministic, correct word boundaries |
| Pinyin | CEDICT numbered→toned conversion + `pinyin-pro` fallback | Correct erhua, tones, particles |
| English translations | Haiku (contextual) with CEDICT fallback | Context-aware but gracefully degrades |

## Files Changed

### `api/segmentWords.js` — Enhanced CEDICT + segmentation engine
- Added numbered pinyin → tone mark conversion (handles erhua like nǎr correctly)
- CEDICT entry scoring: prefers common words over surnames, neutral tone for particles
- `cleanDefinition()`: strips CEDICT syntax (`CL:...`, `[pinyin]` references)
- `subSegment()`: forward maximum matching against CEDICT when `Intl.Segmenter` produces unknown compounds
- `annotateWord()`: builds `{chinese, pinyin, english}` objects from CEDICT data with `pinyin-pro` fallback

### `api/translateWords.js` — New orchestration layer
- `translateWords(client, chineseText, englishContext)` — same export signature
- Step 1: `segmentAndAnnotate()` for word boundaries + pinyin + CEDICT english
- Step 2: `generatePinyin()` for sentence-level pinyin string
- Step 3: Haiku call with `contextual_translations` tool — only asks for english, not segmentation or pinyin
- Step 4: Merge Haiku's english back by matching `chinese` field
- On any Haiku failure: returns CEDICT-annotated words as-is (always has a valid fallback)

### `api/chat.js` + `server.js` — Updated post-processing
- Replaced `segmentAndAnnotate`/`generatePinyin` calls with `translateWords()` calls
- AI response and user input translated in parallel via `Promise.all`
- Added `model` parameter support so clients can specify which Claude model to use

### `src/components/ClickableWord.jsx` — Improved popover
- No longer shows pinyin as "english" when definition is empty
- Multi-definition display: primary definition prominent, secondary definitions smaller

### `src/components/SessionSummary.jsx` + `src/components/VocabImport.jsx` — Use Haiku for lightweight tasks
- Session summaries and vocab conversion now explicitly use Haiku instead of defaulting to Sonnet
- Both import from shared `src/utils/models.js` constants

### `src/utils/models.js` — New shared model constants
- `MODELS.SONNET` and `MODELS.HAIKU` — single source of truth for model IDs

### `src/index.css` — Popover fix
- Word popover now wraps text (`white-space: normal`, `max-width: 200px`) instead of forcing `nowrap`

## Architecture After This Change

```
User sends message
  → POST /api/chat
    → Claude Sonnet generates conversation response (tool_use)
    → Post-processing (parallel):
        ├─ translateWords(AI response, english context)
        │    ├─ segmentAndAnnotate() → word boundaries + CEDICT pinyin + CEDICT english
        │    ├─ generatePinyin() → sentence pinyin string
        │    └─ Haiku contextual_translations → brief contextual english per word
        │         (failure → keep CEDICT english)
        └─ translateWords(user's Chinese input)
             └─ (same pipeline)
    → Response with words[], pinyin, user_words[], user_pinyin
  → Frontend renders ClickableWord components
```
