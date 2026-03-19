# API Directory

Express routes and Vercel serverless functions. Each file exports a handler that works in both environments.

## Routes

| File | Route | Auth | Credits | Purpose |
|------|-------|------|---------|---------|
| `chat.js` | `POST /api/chat` | Required | Deducted | Claude conversation endpoint (tool-use API for structured JSON responses) |
| `speech-token.js` | `POST /api/speech-token` | Required | No | Issues Azure Speech SDK tokens (keeps subscription key server-side) |
| `translateWords.js` | (internal) | — | — | Orchestrates Chinese word translation: deterministic segmentation + Haiku contextual English |
| `segmentWords.js` | (internal) | — | — | Chinese text segmentation, pinyin generation, and CEDICT dictionary lookup |
| `health.js` | `GET /api/health` | No | No | Returns `{ status: 'ok' }` |
| `authMiddleware.js` | (internal) | — | — | JWT validation, credit checking, cost calculation, usage logging |

## Key Concepts

### Authentication Flow
All public routes go through `authMiddleware.js`:
1. `authenticateRequest(req)` — validates `Authorization: Bearer <token>` via Supabase Auth
2. `checkCredits(userId)` — queries `user_credits.balance`
3. After API call: `deductCredits()` subtracts cost and logs to `api_usage_log`

### Cost Calculation (microdollars: 1,000,000 = $1)
- **Sonnet**: 3/input token, 15/output token
- **Haiku**: 1/input token, 2/output token

### Chat Response Structure
`chat.js` uses Claude's tool-use API with a `conversation_response` tool schema returning:
- Chinese text, pinyin, English translation
- Corrections (grammar, vocabulary, pronunciation)
- New vocabulary with pinyin
- Word-by-word breakdown (via `translateWords.js`)

### Word Translation Pipeline
1. `segmentWords.js` — Intl.Segmenter for word boundaries + CEDICT for pinyin/English
2. `translateWords.js` — Haiku call for contextual English translations
3. On Haiku failure, CEDICT definitions serve as fallback

## Data Files

| File | Purpose |
|------|---------|
| `cedict.txt` | CC-CEDICT dictionary (~9.4 MB). Loaded at module init by `segmentWords.js` for fast lookups. |
