# Developer Reference

Quick-lookup reference for the Mandarin Conversation Trainer. Designed to save time when navigating the codebase.

---

## Table of Contents

- [Environment Variables](#environment-variables)
- [App State Machine](#app-state-machine)
- [Auth Gating Flow](#auth-gating-flow)
- [API Endpoints](#api-endpoints)
- [API Request/Response Shapes](#api-requestresponse-shapes)
- [Database Schema](#database-schema)
- [db.js Function Reference](#dbjs-function-reference)
- [localStorage Fallback](#localstorage-fallback)
- [Credit System](#credit-system)
- [File Index](#file-index)

---

## Environment Variables

All in `mandarin-trainer/.env`. Also set in Vercel dashboard for production.

| Variable | Required | Used By | Purpose |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Yes | `api/chat.js` | Claude API access |
| `AZURE_SPEECH_KEY` | Yes | `api/speech-token.js` | Azure Speech SDK subscription key |
| `AZURE_SPEECH_REGION` | Yes | `api/speech-token.js` | Azure region (e.g. `eastus`) |
| `VITE_SUPABASE_URL` | Yes | `src/utils/supabase.js` | Supabase project URL (client-side, `VITE_` prefix) |
| `VITE_SUPABASE_ANON_KEY` | Yes | `src/utils/supabase.js` | Supabase anon/public key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `api/authMiddleware.js` | Supabase service role key (server-side only, bypasses RLS) |
| `SUPABASE_ACCESS_TOKEN` | No | Supabase CLI | CLI access token (not used by app) |

---

## App State Machine

All screen navigation is managed in `src/App.jsx` with a single `screen` state variable.

```
TopicSelector (home, screen='topics')
  ├── ConversationScreen   (screen='conversation', requires selectedTopic)
  ├── FlashcardScreen      (screen='flashcards')
  ├── VocabScreen           (screen='vocab')
  ├── Dashboard             (screen='dashboard')
  ├── PronunciationScreen   (screen='pronunciation')
  └── SettingsScreen        (screen='settings')
```

All screens return to `'topics'` via `onBack()`. No direct screen-to-screen transitions exist.

### Navigation Props

| Prop | Passed To | Purpose |
|------|-----------|---------|
| `onSelectTopic(topic)` | TopicSelector | Sets `selectedTopic` + `screen='conversation'` |
| `onNavigate(dest)` | TopicSelector | Sets `screen` to dest string |
| `onBack()` | All other screens | Resets to `screen='topics'` (+ clears `selectedTopic` for conversation) |
| `topic` | ConversationScreen | The selected topic object from TOPICS array |

---

## Auth Gating Flow

Defined in `src/App.jsx` lines 15-46. Checked **before** any screen renders.

```
1. loading === true          → Spinner
2. user === null             → AuthScreen (login/signup)
3. credits <= 0              → PromoCodeScreen (redeem code)
4. credits === null          → Spinner (still fetching credits)
5. credits > 0               → App screens (TopicSelector hub)
```

Auth state comes from `useAuth()` hook → `AuthContext.jsx` → Supabase `onAuthStateChange`.

---

## API Endpoints

| Method | Route | Auth | Credits | File |
|--------|-------|------|---------|------|
| POST | `/api/chat` | Bearer token | Deducted | `api/chat.js` |
| POST | `/api/speech-token` | Bearer token | No | `api/speech-token.js` |
| GET | `/api/health` | No | No | `api/health.js` |

Internal (not HTTP-exposed, called by `chat.js`):
- `api/translateWords.js` — word translation orchestrator
- `api/segmentWords.js` — Chinese segmentation + CEDICT lookup

---

## API Request/Response Shapes

### POST /api/chat

**Request:**
```json
{
  "messages": [{ "role": "user|assistant", "content": "string" }],
  "systemPrompt": "string",
  "maxTokens": 1024,
  "tools": [{ "name": "...", "input_schema": {} }],
  "model": "claude-sonnet-4-6"
}
```

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Response (200):**
```json
{
  "content": {
    "response": "Chinese text",
    "english": "English translation",
    "corrections": [
      {
        "type": "grammar|vocabulary|pronunciation",
        "original": "what user said",
        "corrected": "correct form",
        "pinyin": "pinyin for corrected",
        "explanation": "English explanation"
      }
    ],
    "new_vocabulary": [
      { "word": "...", "pinyin": "...", "english": "...", "context": "..." }
    ],
    "user_english": "translation of user's input",
    "teaching_notes": "string (teacher mode only)",
    "words": [{ "chinese": "...", "pinyin": "...", "english": "..." }],
    "pinyin": "space-separated pinyin for AI response",
    "user_words": [{ "chinese": "...", "pinyin": "...", "english": "..." }],
    "user_pinyin": "space-separated pinyin for user text"
  },
  "credits": {
    "cost": 45000,
    "remaining": 24955000
  }
}
```

**Errors:**
- `401`: `{ "error": "Missing authorization header" }` or `{ "error": "Invalid or expired token" }`
- `402`: `{ "error": "Out of credits — enter a promo code to continue" }`
- `500`: `{ "error": "description" }`

### POST /api/speech-token

**Request:** Empty POST body. **Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{ "token": "azure-token-string", "region": "eastus" }
```

If Azure credentials missing: `{ "token": null, "region": null }`

---

## Database Schema

### User-Scoped Tables (RLS: `auth.uid() = user_id`)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `user_settings` | `user_id` (UNIQUE), user_name, user_context, tts_voice, pinyin_display_mode | Preferences |
| `user_vocabulary` | `user_id + vocabulary_id` (UNIQUE), status, context_sentence, FSRS fields | Per-user word progress |
| `sessions` | `user_id`, topic, started_at, exchange_count, avg_accuracy, summary | Conversation sessions |
| `exchanges` | `user_id`, session_id, turn_number, user_text, pronunciation_score, ai_data | Conversation turns |
| `review_log` | `user_id`, user_vocabulary_id, rating (1-4), duration_ms, scheduled/actual_days | FSRS review attempts |
| `mistake_patterns` | `user_id`, type, description, occurrence_count, example_original/corrected | Error tracking |
| `shadowing_attempts` | `user_id`, reference_text, scores (accuracy/fluency/completeness/overall) | Pronunciation practice |
| `user_credits` | `user_id` (UNIQUE), balance, total_spent | Credit balance (microdollars) |
| `promo_redemptions` | `user_id + promo_code_id` (UNIQUE), credited_amount | Redemption records |
| `api_usage_log` | `user_id`, model, input/output_tokens, cost, endpoint | Per-request cost log |

### Shared Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `vocabulary` | `word` (UNIQUE), pinyin, english, hsk_level | Dictionary (all users) |
| `promo_codes` | `code` (UNIQUE), credit_amount, max_uses, current_uses, active | Promo code definitions |

### FSRS Fields (on `user_vocabulary`)

`difficulty`, `stability`, `retrievability`, `reps`, `lapses`, `state`, `due_date`, `last_reviewed`

### Triggers

- `handle_new_user` — on `auth.users` INSERT → creates `user_credits` row with `balance: 0`

### RPC Functions

- `redeem_promo_code(p_code TEXT, p_user_id UUID)` → Returns JSON `{ success, credited, balance }` or `{ success: false, error }`. Atomic: locks row, checks usage limits + duplicate redemption, updates all tables in one transaction.

---

## db.js Function Reference

All functions in `src/utils/db.js`. Each checks `useSupabase()` first — if false, proxies to `localDb.js`.

### Settings
| Function | Tables | Notes |
|----------|--------|-------|
| `getSettings()` | `user_settings` | Returns defaults if no row exists |
| `saveSettings(settings)` | `user_settings` | Upserts on `user_id` |

### Sessions
| Function | Tables | Notes |
|----------|--------|-------|
| `createSession(topic)` | `sessions` | Returns session `id` |
| `endSession(id, stats)` | `sessions` | Updates with exchangeCount, avgAccuracy, summary, etc. |
| `saveExchange(sessionId, turn, userData, aiData)` | `exchanges` | userData: `{ text, pronunciationScore, fluencyScore, wordScores }` |
| `getRecentSessions(limit=10)` | `sessions` | Sorted by started_at desc |

### Vocabulary
| Function | Tables | Notes |
|----------|--------|-------|
| `getVocabulary(status=null)` | `user_vocabulary` + `vocabulary` | Joined, flattened. Filter by status or get all. |
| `upsertWord(word, pinyin, english, source, contextSentence)` | `vocabulary` → `user_vocabulary` | Two-step: dictionary upsert (on `word`), then user progress upsert (on `user_id, vocabulary_id`) |
| `updateWordStats(word, wasCorrect, pronScore)` | `vocabulary` → `user_vocabulary` | Auto-promotes to 'known' at 3 correct, demotes if accuracy < 70 |
| `updateWordStatus(word, newStatus)` | `vocabulary` → `user_vocabulary` | Manual status change |
| `importWords(wordList, status='new')` | `vocabulary` → `user_vocabulary` | Batch import, returns count. Each item: `{ word, pinyin, english }` |

### FSRS
| Function | Tables | Notes |
|----------|--------|-------|
| `getDueVocabulary(limit=20)` | `user_vocabulary` + `vocabulary` | Where `due_date <= now()`, sorted asc |
| `updateFSRSCard(userVocabId, fsrsUpdate)` | `user_vocabulary` | Updates all FSRS fields + timestamps |
| `saveReviewLog(userVocabId, rating, durationMs, scheduledDays, actualDays)` | `review_log` | Rating 1-4 |

### Mistakes
| Function | Tables | Notes |
|----------|--------|-------|
| `recordMistakePattern(type, desc, original, corrected)` | `mistake_patterns` | Upserts: increments count if desc exists |
| `getMistakePatterns(limit=10)` | `mistake_patterns` | Unresolved, sorted by occurrence_count desc |

### Pronunciation
| Function | Tables | Notes |
|----------|--------|-------|
| `getPronunciationSentences(limit=15)` | `user_vocabulary` + `vocabulary` | Extracts context_sentence, prioritizes low accuracy |
| `savePronunciationAttempt(refText, refPinyin, scores, wordScores)` | `shadowing_attempts` | scores: `{ accuracy, fluency, completeness, overall }` |
| `getPronunciationTrend(days=30)` | `sessions` | Sessions with avg_accuracy from past N days |

### Internal Helper
- `getCurrentUserId()` — calls `supabase.auth.getUser()`, returns UUID or null

---

## localStorage Fallback

`src/utils/localDb.js` mirrors the `db.js` API for offline/no-Supabase use.

**When active:** `getSupabaseClient()` returns falsy (no `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).

**Disabled when:** User is authenticated via Supabase Auth (multi-user can't share localStorage).

| localStorage Key | Equivalent Table |
|------------------|-----------------|
| `mt_settings` | `user_settings` |
| `mt_sessions` | `sessions` |
| `mt_exchanges` | `exchanges` |
| `mt_vocab_dict` | `vocabulary` |
| `mt_user_vocab` | `user_vocabulary` |
| `mt_review_log` | `review_log` |
| `mt_mistakes` | `mistake_patterns` |
| `mt_shadowing` | `shadowing_attempts` |

---

## Credit System

### Units
**Microdollars**: 1,000,000 = $1.00. All balances and costs stored as integers.

### Cost Rates (per token)

| Model | Input | Output | Model ID |
|-------|-------|--------|----------|
| Sonnet | 3 | 15 | `claude-sonnet-4-6` |
| Haiku | 1 | 2 | `claude-haiku-4-5-20251001` |

### Typical Costs
- Single conversation exchange: ~$0.01–0.03 (10,000–30,000 microdollars)
- Session summary (Haiku): ~$0.002
- $25.00 credit = 25,000,000 microdollars ≈ 800–2,500 exchanges

### Flow
1. Client sends request with `Authorization: Bearer <token>`
2. `authMiddleware.authenticateRequest()` validates JWT → gets `user.id`
3. `authMiddleware.checkCredits(userId)` queries `user_credits.balance`
4. If balance <= 0 → 402 response
5. Claude API call executes
6. `authMiddleware.calculateCost()` computes microdollar cost from token usage
7. `authMiddleware.deductCredits()` subtracts from balance, logs to `api_usage_log`
8. Response includes `credits: { cost, remaining }`

### Promo Codes (current)

| Code | Credit Amount | Max Uses |
|------|--------------|----------|
| `BETA2024` | $25.00 (25,000,000) | 50 |
| `FRIEND25` | $25.00 (25,000,000) | 10 |

Managed in `promo_codes` table. Redeemed via `supabase.rpc('redeem_promo_code')`.

---

## File Index

### Server (`api/`)
| File | Purpose |
|------|---------|
| `chat.js` | Claude conversation endpoint — tool-use API, structured JSON, auth + credit deduction |
| `speech-token.js` | Azure Speech token issuer (keeps subscription key server-side) |
| `translateWords.js` | Word translation orchestrator: Intl.Segmenter + CEDICT + Haiku contextual English |
| `segmentWords.js` | Chinese segmentation, pinyin generation, CEDICT dictionary lookup |
| `authMiddleware.js` | JWT validation, credit check/deduct, cost calculation, usage logging |
| `health.js` | Health check → `{ status: 'ok' }` |
| `cedict.txt` | CC-CEDICT dictionary file (~9.4 MB), loaded by segmentWords.js |

### Components (`src/components/`)
| File | Purpose |
|------|---------|
| `AuthScreen.jsx` | Login/signup with email confirmation |
| `PromoCodeScreen.jsx` | Promo code entry for zero-credit users |
| `TopicSelector.jsx` | Home screen — topic list + credit balance |
| `ConversationScreen.jsx` | Main chat UI — STT/TTS/Claude integration |
| `FlashcardScreen.jsx` | FSRS spaced repetition review |
| `VocabScreen.jsx` | Container for VocabImport + VocabList |
| `VocabImport.jsx` | CSV/text vocabulary import via Claude |
| `VocabList.jsx` | Tabbed word list (Known/Learning/New) |
| `Dashboard.jsx` | Analytics: pronunciation trends, sessions, streaks |
| `SettingsScreen.jsx` | Preferences, account, credits, sign out |
| `PronunciationScreen.jsx` | Dedicated pronunciation practice |
| `SessionSummary.jsx` | AI-generated session recap |
| `ChatBubble.jsx` | Message bubble with pronunciation coloring |
| `ClickableWord.jsx` | Interactive word with pinyin/English popover |
| `CorrectionPanel.jsx` | Grammar/vocab/pronunciation corrections display |
| `SetupScreen.jsx` | First-time onboarding splash |

### Contexts (`src/contexts/`)
| File | Purpose |
|------|---------|
| `AuthContext.jsx` | AuthProvider — user, session, credits, auth methods |
| `authContextValue.js` | React context object creation |

### Hooks (`src/hooks/`)
| File | Purpose |
|------|---------|
| `useAuth.js` | Consumer hook for AuthContext |
| `useAzureSpeech.js` | STT + per-word pronunciation scoring (Azure → Web Speech fallback) |
| `useAzureTTS.js` | TTS via SSML with rate control (Azure → Web Speech fallback) |
| `useConversation.js` | Chat state, message history, sends to /api/chat |

### Utils (`src/utils/`)
| File | Purpose |
|------|---------|
| `apiFetch.js` | Authenticated fetch wrapper, throws CreditError on 402 |
| `supabase.js` | Supabase client singleton |
| `db.js` | Database abstraction (Supabase) — all CRUD operations |
| `localDb.js` | localStorage fallback mirroring db.js API |
| `config.js` | Azure token caching (10 min TTL), env config helpers |
| `claudePrompt.js` | System prompts for conversation/review/teacher modes |
| `summaryPrompt.js` | Session summary prompt + tool schema |
| `models.js` | Model ID constants (SONNET, HAIKU) |
| `pronunciationFeedback.js` | Actionable pronunciation tips from Azure scores |

### Supabase (`supabase/`)
| File | Purpose |
|------|---------|
| `config.toml` | Local dev config (auth, API settings) |
| `migrations/20260318220059_beta_multi_tenant.sql` | Multi-tenant schema, RLS, credits, promo codes, redeem function |
| `migrations/20260319022544_auto_create_user_credits.sql` | Auto-create user_credits trigger on signup |
