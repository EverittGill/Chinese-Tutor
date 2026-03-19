# Utils Directory

Shared utilities for database, API communication, AI prompts, and configuration.

## Database

| File | Purpose |
|------|---------|
| `supabase.js` | Supabase client singleton. `getSupabaseClient()` lazy-initializes from env vars. |
| `db.js` | Primary database abstraction (Supabase). All CRUD for settings, sessions, vocabulary, reviews. Includes `getCurrentUserId()` for multi-user support. Falls back to `localDb.js` when Supabase is unconfigured. |
| `localDb.js` | localStorage fallback mirroring `db.js` API. Keys prefixed `mt_`. Disabled when Supabase auth is active (multi-user can't share localStorage). |

### Key db.js Functions
- `getSettings()` / `saveSettings()` — user preferences (upserts on `user_id`)
- `getVocabulary()` / `upsertWord()` — vocabulary dictionary + user progress
- `saveSession()` / `getRecentSessions()` — conversation sessions
- `saveExchange()` — individual conversation turns
- `logReview()` — FSRS spaced repetition review entries
- `updateWordStatus()` — move words between known/learning/new

## API Communication

| File | Purpose |
|------|---------|
| `apiFetch.js` | Authenticated fetch wrapper. Gets session token from Supabase, adds `Authorization: Bearer` header. Throws `CreditError` on 402 responses. |
| `config.js` | Azure token caching (10 min TTL, refresh at 8 min). Environment config helpers: `getSupabaseConfig()`, `hasSupabaseConfig()`, `hasAllConfig()`. |
| `models.js` | Model ID constants: `MODELS.SONNET` and `MODELS.HAIKU`. |

## AI Prompts

| File | Purpose |
|------|---------|
| `claudePrompt.js` | System prompt generation for conversation modes. `getSystemPrompt()`, `getReviewSystemPrompt()`, `getTeacherSystemPrompt()`. Rules: HSK 2-3, 1-3 sentences, max 3 corrections, max 1 new word/exchange. Includes `formatVocabularyContext()` for known/learning/next words. |
| `summaryPrompt.js` | Session summary prompt + `summaryTool` schema. Returns: assessment, did_well, needs_work, mistake_patterns, practice_sentences. |

## Speech

| File | Purpose |
|------|---------|
| `pronunciationFeedback.js` | Generates actionable pronunciation tips from Azure scores + pinyin. Data tables for initial consonant tips and tone descriptions (1-4). No API calls. |
