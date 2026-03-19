# Hooks Directory

Custom React hooks for speech, conversation, and auth.

## Files

| Hook | Purpose |
|------|---------|
| `useAuth.js` | Context consumer for `AuthContext`. Throws if used outside `AuthProvider`. |
| `useAzureSpeech.js` | Speech-to-text with pronunciation scoring via Azure Speech SDK. Falls back to Web Speech API. |
| `useAzureTTS.js` | Text-to-speech via Azure SSML with adjustable rate (0.7x for slow replay). Falls back to Web Speech Synthesis. |
| `useConversation.js` | Chat state management. Posts to `/api/chat`, stores message history, supports normal/review/teacher modes. |

## useAzureSpeech

Returns: `recognizedText`, `accuracyScores` (per-word), `turnId`, `isListening`, `startListening`, `stopListening`

Pronunciation scoring: Azure returns `{ word, accuracyScore, errorType }` per word. No tone/prosody data at word level.

## useAzureTTS

Returns: `speak(text, rate?)`, `speakSlow(text)`, `stop`, `isSpeaking`

Uses SSML `<prosody rate="...">` for speed control. `speakSlow` uses 0.7x rate.

## useConversation

Takes: `topic`, `vocabularyContext`, `mode`, `levelContext`, `sessionFocus`, `learnerBriefing`, `userProfile`

Returns: `sendMessage(text)`, `messages`, `isLoading`, `error`

Modes affect system prompt via `claudePrompt.js`. Uses `apiFetch` for authenticated requests. Handles 402 (out of credits) errors.
