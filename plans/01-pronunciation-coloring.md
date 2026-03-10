# Feature 01: Word-Level Pronunciation Coloring

> **Type:** Infrastructure — integrates into existing Conversation screen
> **Complexity:** Small
> **Prerequisites:** None
> **Research basis:** Sections 3.2 (Immediate Feedback), 6.3 (Pronunciation Feedback), 7.5 (Azure Pronunciation Assessment)

---

## What It Does

After the user speaks a sentence in Chinese, each word in their chat bubble gets a colored underline showing how well they pronounced it. Tapping a word shows its pinyin, English meaning, pronunciation score, and what went wrong (error type).

Currently Azure returns per-word pronunciation data on every utterance but the UI only shows a single aggregate number. The user sees "72/100" but never knows *which* words dragged the score down.

## How It Looks (iPhone 13 Pro Max)

```
┌──────────────────────────────────┐
│  User bubble:                    │
│  ┌──────────────────────────┐    │
│  │ 我 想 去 商店 买 东西     │ 你 │
│  │ ─── ─── ─── ──── ─── ───│    │
│  │ grn grn red  ylw  grn grn│    │
│  │                   85/100 │    │
│  └──────────────────────────┘    │
│                                  │
│  [Tapped "商店"]:                │
│  ┌────────────┐                  │
│  │ shāng diàn │ ← pinyin        │
│  │ store      │ ← english       │
│  │ 62/100     │ ← score (yellow)│
│  │ Mispronun. │ ← error type    │
│  └────────────┘                  │
└──────────────────────────────────┘
```

- **Green underline** (>=80): Good pronunciation
- **Yellow underline** (60-79): Needs work
- **Red underline** (<60): Poor pronunciation
- **No underline**: No pronunciation data for this word
- AI bubbles are never underlined

## Data Flow

```
CURRENT:
useAzureSpeech → pronunciationData.words [{word, accuracyScore, errorType}]
     ↓
ConversationScreen → stores only aggregate pronunciationScore
     ↓
ChatBubble → ScoreBadge shows single number

NEW:
useAzureSpeech → pronunciationData.words [{word, accuracyScore, errorType}]
     ↓
ConversationScreen → stores wordScores array in chatHistory entry
     ↓
ChatBubble → matches wordScores against userWords by chinese text
     ↓
ClickableWord → colored underline + score & errorType in popover
```

## Integration Points

| Component | How It's Affected |
|-----------|------------------|
| `useAzureSpeech.js` | **No changes.** Already returns `pronunciationData.words` with `{word, accuracyScore, errorType}` per word. |
| `ConversationScreen.jsx` | Passes `wordScores` array through to ChatBubble. Two touch points: the chatHistory state update and the JSX rendering. |
| `ChatBubble.jsx` | Accepts `wordScores` prop, matches each `userWord.chinese` against `wordScore.word` to find scores, passes to ClickableWord. |
| `ClickableWord.jsx` | Accepts `pronunciationScore` and `errorType` props. Adds colored underline class. Shows score + error type in popover. |
| **Flashcards (Feature 04)** | Not affected. |
| **Shadowing (Feature 05)** | Uses the same color scheme for consistency, but implements its own word display (not ClickableWord). |

## File Changes

### 1. `src/components/ConversationScreen.jsx`

**Line ~129** — Add `wordScores` to chat history entry:
```js
// BEFORE:
setChatHistory(prev => [...prev, {
  userText: currentText,
  pronunciationScore: currentScore,
  aiResponse: null
}]);

// AFTER:
setChatHistory(prev => [...prev, {
  userText: currentText,
  pronunciationScore: currentScore,
  wordScores: currentPronData?.words || null,
  aiResponse: null
}]);
```

**Lines ~324-331** — Pass `wordScores` to user ChatBubble:
```jsx
<ChatBubble
  type="user"
  text={entry.userText}
  userWords={entry.aiResponse?.user_words}
  userPinyin={entry.aiResponse?.user_pinyin}
  score={entry.pronunciationScore}
  wordScores={entry.wordScores}       // ← NEW
  displayMode={displayMode}
/>
```

### 2. `src/components/ChatBubble.jsx`

**Line 10** — Accept new props:
```js
// BEFORE:
export default function ChatBubble({ type, text, userWords, userPinyin, aiResponse, score, displayMode, onSpeak, onShowCorrections }) {

// AFTER:
export default function ChatBubble({ type, text, userWords, userPinyin, aiResponse, score, wordScores, displayMode, onSpeak, onSpeakSlow, onShowCorrections }) {
```

Note: `onSpeakSlow` is also added here in preparation for Feature 02 (TTS Speed). It won't be wired up until that feature is implemented.

**Lines 22-31** — Match words to scores:
```jsx
// BEFORE:
userWords.map((w, i) => (
  <ClickableWord key={i} word={w} isActive={activeWord === w} onTap={handleWordTap} displayMode={displayMode} />
))

// AFTER:
userWords.map((w, i) => {
  const pronData = wordScores?.find(ws => ws.word === w.chinese);
  return (
    <ClickableWord
      key={i}
      word={w}
      isActive={activeWord === w}
      onTap={handleWordTap}
      displayMode={displayMode}
      pronunciationScore={pronData?.accuracyScore}
      errorType={pronData?.errorType}
    />
  );
})
```

The match is `ws.word === w.chinese` because:
- `wordScores` (from Azure): `{word: "你好", accuracyScore: 85, errorType: "None"}`
- `userWords` (from Claude): `{chinese: "你好", pinyin: "nǐ hǎo", english: "hello"}`

### 3. `src/components/ClickableWord.jsx`

**Line 3** — Accept new props:
```js
export default function ClickableWord({ word, isActive, onTap, displayMode, pronunciationScore, errorType }) {
```

**Before the return (after line 15)** — Compute score class:
```js
const scoreClass = pronunciationScore != null
  ? pronunciationScore >= 80 ? 'border-b-2 border-green-400'
    : pronunciationScore >= 60 ? 'border-b-2 border-yellow-400'
    : 'border-b-2 border-red-400'
  : '';
```

**Line 18** — Apply class:
```jsx
<span ref={ref} className={`clickable-word ${scoreClass}`} onClick={() => onTap(isActive ? null : word)}>
```

**Lines 27-31** — Expand popover:
```jsx
{isActive && (
  <span className="word-popover">
    <span className="font-medium text-teal-300">{word.pinyin}</span>
    <span className="text-slate-300">{word.english}</span>
    {pronunciationScore != null && (
      <span className={`text-xs font-medium ${
        pronunciationScore >= 80 ? 'text-green-400'
        : pronunciationScore >= 60 ? 'text-yellow-400'
        : 'text-red-400'
      }`}>
        {pronunciationScore}/100
      </span>
    )}
    {errorType && errorType !== 'None' && (
      <span className="text-xs text-red-300">{errorType}</span>
    )}
  </span>
)}
```

## Verification

1. `npx vite build` — no errors
2. Start a conversation, speak Chinese
3. After AI responds (providing `user_words`), user bubble re-renders with colored underlines
4. Each word: green (>=80), yellow (60-79), red (<60), none (no data)
5. Tap a word — popover shows pinyin, English, score, and error type
6. AI bubbles have no underlines
7. Aggregate ScoreBadge still appears
8. All existing features (topics, review mode, vocab import) still work
