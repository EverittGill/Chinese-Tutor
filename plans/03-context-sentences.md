# Feature 03: Context Sentence Infrastructure

> **Type:** Infrastructure — data layer change that feeds Flashcards (Feature 04) and improves vocabulary quality across the app
> **Complexity:** Small
> **Prerequisites:** None (can be done in parallel with Features 01-02)
> **Research basis:** Section 5.2 (Contextual Learning Over Rote Memorization), Section 3.3 (Sentences Over Isolated Words), Section 6.4 (Adaptive Vocabulary System)

---

## Why This Matters

The research is emphatic: **"Never present vocabulary in isolation."** Words learned in context are retained 2-3x longer than words from isolated lists. The brain creates multiple retrieval pathways when a word is associated with a situation.

Right now, Claude returns a `context` field for each new vocabulary word (describing when to use it), but `ConversationScreen.jsx` **discards it** — `upsertWord(v.word, v.pinyin, v.english, 'conversation')` never passes it through. The database has no column for it.

This feature fixes that pipeline so every vocabulary word carries the sentence where it was first encountered. Flashcards (Feature 04) and the vocabulary screen then display this context.

## What Changes

```
CURRENT DATA FLOW:
Claude returns: { word: "商店", pinyin: "shāngdiàn", english: "store", context: "When going shopping" }
                                                                        ↓
ConversationScreen: upsertWord(v.word, v.pinyin, v.english, 'conversation')  ← context DISCARDED
                                                                        ↓
Database: { word, pinyin, english, source, status, ... }  ← no context

NEW DATA FLOW:
Claude returns: { word: "商店", pinyin: "shāngdiàn", english: "store", context_sentence: "我想去商店买东西" }
                                                                        ↓
ConversationScreen: upsertWord(v.word, v.pinyin, v.english, 'conversation', v.context_sentence)
                                                                        ↓
Database: { word, pinyin, english, source, context_sentence, ... }  ← preserved!
                                                                        ↓
FlashcardScreen: shows "我想去【商店】买东西" on card  ← word in context
```

## Integration Points

| Component | How It's Affected |
|-----------|------------------|
| `database/schema.sql` | Add `context_sentence` column to vocabulary table |
| `api/chat.js` | Change tool schema: rename `context` to `context_sentence`, update description to ask for the full Chinese sentence |
| `src/utils/claudePrompt.js` | Update system prompt to instruct Claude to provide the full sentence containing the new word |
| `src/utils/db.js` | Add `contextSentence` parameter to `upsertWord` |
| `src/utils/localDb.js` | Same |
| `src/components/ConversationScreen.jsx` | Pass `v.context_sentence` to `upsertWord` |
| **Flashcards (Feature 04)** | Reads `context_sentence` from vocabulary and displays on card back |
| **VocabScreen** | Could optionally display context sentence (low priority, not required) |

## File Changes

### 1. `database/schema.sql`

Add column to vocabulary table definition (after `notes text,`):
```sql
  context_sentence text,
```

Migration for existing databases:
```sql
-- Migration: Add context sentence for vocabulary
-- ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS context_sentence text;
```

### 2. `api/chat.js`

In the tool schema for `new_vocabulary` items, change:
```js
// BEFORE:
context: { type: 'string', description: 'When to use this word' }

// AFTER:
context_sentence: { type: 'string', description: 'The full Chinese sentence from your response that contains this word' }
```

### 3. `src/utils/claudePrompt.js`

In the system prompt's NEW VOCABULARY RULES section, add:
```
- For each new word, include the full Chinese sentence from your response where it appears as context_sentence
```

### 4. `src/utils/db.js` — `upsertWord`

```js
// BEFORE:
export async function upsertWord(word, pinyin, english, source = 'conversation') {
  ...
  const { error } = await sb
    .from('vocabulary')
    .upsert({
      word, pinyin, english, source,
      status: 'learning',
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'word' });

// AFTER:
export async function upsertWord(word, pinyin, english, source = 'conversation', contextSentence = null) {
  ...
  const row = {
    word, pinyin, english, source,
    status: 'learning',
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (contextSentence) row.context_sentence = contextSentence;
  const { error } = await sb
    .from('vocabulary')
    .upsert(row, { onConflict: 'word' });
```

The `if` guard ensures we don't overwrite an existing context_sentence with null on subsequent encounters.

### 5. `src/utils/localDb.js` — `upsertWord`

Same signature change:
```js
export async function upsertWord(word, pinyin, english, source = 'conversation', contextSentence = null) {
```

In the "new word" branch, add `context_sentence: contextSentence` to the object.
In the "existing word" branch, only update context_sentence if one is provided and the word doesn't already have one.

### 6. `src/components/ConversationScreen.jsx`

**Line ~188** — Pass context through:
```js
// BEFORE:
upsertWord(v.word, v.pinyin, v.english, 'conversation');

// AFTER:
upsertWord(v.word, v.pinyin, v.english, 'conversation', v.context_sentence);
```

## Verification

1. `npx vite build` — no errors
2. Start a conversation. Speak until the AI introduces a new vocabulary word.
3. Check localStorage (`mt_vocabulary`) or Supabase — the new word should have a `context_sentence` field containing the Chinese sentence from the AI's response.
4. Import words via VocabImport — they should still work (contextSentence defaults to null).
5. Existing vocabulary words without context_sentence should be unaffected.
6. The conversation flow should work exactly as before — this is a data-only change with no visible UI changes (UI changes come in Feature 04).
