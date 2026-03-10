# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

All commands run from `mandarin-trainer/`:

```bash
npm run dev      # Starts Vite (port 3000) + Express proxy (port 3001) concurrently
npm run build    # Production build → dist/
npm start        # Express server only (no Vite HMR)
npx eslint src/  # Lint (ESLint 9 flat config, React Hooks rules)
```

No test framework is configured.

## Architecture

Single-user Mandarin conversation trainer: React + Vite frontend, Express/Vercel serverless backend, Claude API for conversation, Azure Speech SDK for STT/TTS/pronunciation scoring.

### Request Flow

```
Voice Input → useAzureSpeech (client-side Azure STT + pronunciation scores)
  → POST /api/chat (Claude tool-use → structured JSON with response, corrections, vocabulary, word breakdown)
  → useAzureTTS (Azure SSML with rate control) → Audio playback
```

### Key Architectural Decisions

- **Claude tool-use for structured output**: `api/chat.js` uses Claude's tool-use API (not text parsing) with a `conversation_response` tool schema that returns Chinese text, pinyin, English, corrections, new vocabulary, and word-by-word breakdowns.
- **Two-tier persistence**: `db.js` wraps Supabase; `localDb.js` mirrors the same API with localStorage (keys prefixed `mt_`). The app falls back to localStorage when Supabase credentials are missing.
- **Normalized vocabulary schema**: `vocabulary` table (dictionary, word UNIQUE) + `user_vocabulary` table (user progress, FSRS scheduling fields). Schema changes must be applied via Supabase SQL Editor (no CLI).
- **Dual-server dev setup**: Vite dev server (3000) proxies `/api/*` to Express (3001). In production, Vercel serves both static files and serverless functions from `api/`.
- **Speech fallback chain**: Azure Speech SDK → Web Speech API fallback for both STT and TTS.

### Module Roles

| Module | Role |
|--------|------|
| `api/chat.js` | Claude conversation endpoint (works as both Express route and Vercel serverless function) |
| `api/speech-token.js` | Issues Azure Speech tokens (keeps subscription key server-side) |
| `src/hooks/useConversation.js` | Chat state, message history (`messagesRef`), two modes: `"normal"` and `"review"` |
| `src/hooks/useAzureSpeech.js` | STT + pronunciation scoring per word (`accuracyScore`, `errorType`) |
| `src/hooks/useAzureTTS.js` | TTS via SSML with adjustable rate (0.7x for slow replay) |
| `src/utils/claudePrompt.js` | System prompts for conversation and flashcard modes |
| `src/utils/db.js` / `localDb.js` | Database abstraction (Supabase primary, localStorage fallback) |
| `src/utils/config.js` | Environment config + Azure token caching |

### Screen Navigation

`TopicSelector` (home) → `ConversationScreen` | `FlashcardScreen` | `VocabScreen` | `Dashboard`

## Environment Variables

Required in `mandarin-trainer/.env`:
```
ANTHROPIC_API_KEY
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Conventions

- Mobile-first (iPhone 13 Pro Max target), dark theme (`slate-900` bg)
- Pronunciation coloring: green (≥80%), yellow (60-79%), red (<60%)
- Chinese font stack: PingFang SC → Microsoft YaHei → fallbacks
- FSRS (ts-fsrs) for spaced repetition scheduling with ratings 1-4
- Feature plans live in `plans/` directory, numbered sequentially
