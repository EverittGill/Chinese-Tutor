# Feature 02: Adjustable TTS Speed + Slow Replay

> **Type:** Infrastructure — integrates into Conversation screen + used by Shadowing (Feature 05)
> **Complexity:** Small
> **Prerequisites:** Feature 01 (adds `onSpeakSlow` to ChatBubble signature)
> **Research basis:** Section 1.2 (Comprehensible Input / i+1 principle), Section 1.6 (Shadowing — progressive speed)

---

## What It Does

1. **Global speed toggle** in conversation header: cycles 1x → 0.7x → 0.5x
2. **Slow replay button** on every AI bubble: always plays at 0.5x regardless of global setting
3. **Speed parameter** on the `speak()` function so any caller (conversation, shadowing, flashcards) can control playback rate

The research says learners at HSK 2-3 often can't parse natural-speed Mandarin. Slowing down makes input comprehensible (i+1). The slow replay button gives on-demand access without changing the global speed.

## How It Looks (iPhone 13 Pro Max)

### Conversation Header
```
┌──────────────────────────────────────────┐
│ ← Back    chinese+pinyin  🔊 0.7x  Finish│
└──────────────────────────────────────────┘
```

The speed toggle sits next to the display mode toggle. Tapping cycles through speeds. Current speed is always visible.

### AI Bubble
```
┌─────────────────────────────────────┐
│ 林  ┌─────────────────────────────┐ │
│     │ 你想去哪个商店？              │ │
│     │ Where do you want to go?     │ │
│     │ 🔊  🔊½  2 corrections       │ │
│     └─────────────────────────────┘ │
└─────────────────────────────────────┘
         ↑    ↑
    normal  slow (always 0.5x)
```

Two speaker buttons side by side. The slow one has a "½" label to distinguish it. Both are small and unobtrusive.

## How Speed Works Technically

### Azure TTS (primary)
SSML prosody tag controls rate:
```xml
<speak version="1.0" xmlns="..." xml:lang="zh-CN">
  <voice name="zh-CN-XiaoxiaoNeural">
    <prosody rate="70%">你好世界</prosody>
  </voice>
</speak>
```

When rate is 1.0 (100%), skip the prosody tag entirely to avoid any API quirks.

### Web Speech API (fallback)
```js
utterance.rate = 0.9 * rate;  // base rate is 0.9, multiply by speed factor
```

## Integration Points

| Component | How It's Affected |
|-----------|------------------|
| `useAzureTTS.js` | `speak(text, rate)` — rate parameter added. Builds SSML with prosody tag when rate !== 1.0. |
| `ConversationScreen.jsx` | Owns `ttsSpeed` state. Passes speed to `speak()` calls. Renders speed toggle in header. |
| `ChatBubble.jsx` | Renders slow replay button next to existing speaker button. Receives `onSpeakSlow` prop. |
| **Shadowing (Feature 05)** | Calls `speak(text, 0.7)` for first listen, `speak(text, 1.0)` for retries. Uses the same hook. |
| **Flashcards (Feature 04)** | Calls `speak(word)` at default speed (1.0). Could optionally use speed control later. |

## File Changes

### 1. `src/hooks/useAzureTTS.js`

**Lines 13-15** — Add `rate` parameter to `buildSsml`:
```js
// BEFORE:
function buildSsml(text, voice = 'zh-CN-XiaoxiaoNeural') {
  return `<speak ...><voice name="${voice}">${escapeXml(text)}</voice></speak>`;
}

// AFTER:
function buildSsml(text, voice = 'zh-CN-XiaoxiaoNeural', rate = 1.0) {
  const rateStr = rate === 1.0 ? '' : ` rate="${Math.round(rate * 100)}%"`;
  const content = rateStr ? `<prosody${rateStr}>${escapeXml(text)}</prosody>` : escapeXml(text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${voice}">${content}</voice></speak>`;
}
```

**Line 23** — Add `rate` parameter to `speak`:
```js
const speak = useCallback(async (text, rate = 1.0) => {
```

**Line 42** — Pass rate to buildSsml:
```js
const ssml = buildSsml(text, 'zh-CN-XiaoxiaoNeural', rate);
```

**Line 96** — Apply rate to Web Speech fallback:
```js
utterance.rate = 0.9 * rate;
```

### 2. `src/components/ConversationScreen.jsx`

**After line 27** — Add speed state:
```js
const [ttsSpeed, setTtsSpeed] = useState(1.0);
```

**After cycleDisplayMode callback (~line 210)** — Add speed cycle:
```js
const cycleTtsSpeed = useCallback(() => {
  setTtsSpeed(prev => prev === 1.0 ? 0.7 : prev === 0.7 ? 0.5 : 1.0);
}, []);
```

**Lines 298-302** — Add speed toggle to header:
```jsx
// BEFORE:
<div className="flex-1 text-center">
  <button onClick={cycleDisplayMode} className="text-slate-500 text-xs cursor-pointer hover:text-slate-300">
    {DISPLAY_MODES[displayMode]}
  </button>
</div>

// AFTER:
<div className="flex-1 text-center flex items-center justify-center gap-3">
  <button onClick={cycleDisplayMode} className="text-slate-500 text-xs cursor-pointer hover:text-slate-300">
    {DISPLAY_MODES[displayMode]}
  </button>
  <button onClick={cycleTtsSpeed} className="text-slate-500 text-xs cursor-pointer hover:text-slate-300">
    {ttsSpeed === 1.0 ? '1x' : ttsSpeed === 0.7 ? '0.7x' : '0.5x'}
  </button>
</div>
```

**Lines 100, 145** — Apply speed to auto-speak:
```js
// AI greeting (line ~100):
speak(response.response, ttsSpeed);

// After user speaks (line ~145):
speak(response.response, ttsSpeed);
```

**Line ~338** — Wire both callbacks on AI bubbles:
```jsx
onSpeak={() => speak(entry.aiResponse.response, ttsSpeed)}
onSpeakSlow={() => speak(entry.aiResponse.response, 0.5)}
```

### 3. `src/components/ChatBubble.jsx`

**Lines 80-87** — Add slow replay button after existing speaker:
```jsx
{onSpeak && (
  <button onClick={onSpeak} className="text-slate-500 hover:text-teal-400 text-xs cursor-pointer">
    <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  </button>
)}
{onSpeakSlow && (
  <button onClick={onSpeakSlow} className="text-slate-500 hover:text-teal-400 text-xs cursor-pointer" title="Slow replay">
    <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
    <span className="ml-0.5">½</span>
  </button>
)}
```

## Verification

1. `npx vite build` — no errors
2. Start conversation. AI speaks at normal speed.
3. Tap speed toggle: cycles 1x → 0.7x → 0.5x → 1x
4. At 0.5x, speech is noticeably slower
5. Each AI bubble has two speaker buttons (normal + slow ½)
6. Slow replay always plays at 0.5x regardless of global speed
7. Normal replay uses current global speed
8. User bubbles have no speaker buttons
9. Feature 01 (word coloring) still works
