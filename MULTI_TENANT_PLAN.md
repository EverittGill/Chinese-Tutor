# Multi-Tenant SaaS Transformation Plan

> **INSTRUCTIONS FOR CLAUDE:** Before implementing ANY phase or sub-step of this plan, have a detailed conversation with the user about it first. Walk through every decision, trade-off, and implementation detail. Do not begin coding until the user explicitly says to proceed on that specific phase. Each phase should be discussed, agreed upon, and then implemented separately.

---

## Context

Single-user Mandarin conversation trainer → multi-tenant subscription SaaS. The core product (Claude conversation, FSRS flashcards, Azure speech) stays the same. The work is infrastructure: auth, user-scoping, token optimization, billing.

**Stack decisions:**
- **Auth:** Supabase Auth (`@supabase/auth-ui-react`) + RLS for data isolation
- **Deployment:** Stay on Vercel (no Next.js rewrite)
- **Billing:** Lemon Squeezy (simpler than Stripe, handles tax/VAT)
- **Pricing:** Single $15/mo paid tier + 14-day free trial. Add tiers later based on real usage data.
- **Token management:** Sliding window + structured-data summary (no extra Claude calls)

**Estimated total: ~2.5 weeks**

---

## Phase 0: Token Optimization (DO FIRST — ~2 days)

Understand and cap per-user costs before building multi-tenant infrastructure.

### 0A: Sliding Window for Message History

**Problem:** `useConversation.js:21` sends the entire `messagesRef.current` to Claude every turn. By turn 20, that's ~4,000 tokens of history alone. Total cost for a 20-turn conversation: ~$0.41.

**Solution:** Keep last 8 messages in full. Summarize older messages into a compact context block built from the structured response data we already have (no extra Claude call needed).

```
Summary format (appended to system prompt):
"CONVERSATION SO FAR (turns 1-6): User discussed weekend plans.
Learned: 周末 (weekend), 打算 (plan to). Corrected: time-before-verb pattern.
User expressed interest in food topics."
```

**Files to modify:**
- `src/hooks/useConversation.js` — build summary from older structured responses, send `[summary_msg, ...last_8_messages]`
- `api/chat.js` — accept and use conversation summary in system prompt

**Target:** Cap per-request input at ~3,500 tokens regardless of conversation length. Drops 20-turn cost from ~$0.41 to ~$0.18.

### 0B: Vocabulary Context Trimming

**Problem:** `claudePrompt.js:formatVocabularyContext` sends the user's entire word list. At 500+ words, this could be 1,000+ tokens every request.

**Solution:** Cap at 30 most relevant words per category (known, learning, next). Prioritize words related to current topic + recently struggled words.

**Files to modify:**
- `src/utils/claudePrompt.js` — `formatVocabularyContext()` and `formatLevelContext()`, add relevance filtering + cap

### 0C: Usage Tracking Table

Add lightweight request tracking so we can measure actual per-user costs before setting prices.

**New table:**
```sql
CREATE TABLE usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,  -- 'chat', 'speech_token', 'flashcard'
  input_tokens int,
  output_tokens int,
  created_at timestamptz DEFAULT now()
);
```

**Files to modify:**
- `api/chat.js` — log `response.usage.input_tokens` and `response.usage.output_tokens` (Claude already returns these)
- `database/schema.sql` — add table

---

## Phase 1: Authentication (~1-2 days)

### 1A: Supabase Auth Setup

- Enable email/password auth in Supabase dashboard
- Optionally enable Google OAuth (good for conversion)
- Install `@supabase/auth-ui-react` for pre-built login component

### 1B: Auth UI

- **New:** `src/components/AuthScreen.jsx` — uses `<Auth>` component from `@supabase/auth-ui-react`
- `src/App.jsx` — check `supabase.auth.getSession()` on mount. Show `AuthScreen` if no session, show app if authenticated. Listen to `onAuthStateChange` for login/logout.
- No need for a separate AuthContext — Supabase client manages session internally, use `supabase.auth.getUser()` where needed

### 1C: API Auth Middleware

- `server.js` — add middleware on `/api/chat` and `/api/speech-token` that extracts `Authorization: Bearer <jwt>` header, validates via `supabase.auth.getUser(token)`, attaches `req.userId`
- `api/chat.js` (Vercel) — same validation at top of handler
- `api/speech-token.js` — same validation
- Frontend: update `fetch('/api/chat', ...)` calls to include `Authorization` header from Supabase session

**Files to modify:**
- `src/App.jsx`
- `server.js`
- `api/chat.js`
- `api/speech-token.js`
- `src/hooks/useConversation.js` — add auth header to fetch
- `src/utils/config.js` — add auth header to speech token fetch
- **New:** `src/components/AuthScreen.jsx`

**New dependency:** `@supabase/auth-ui-react`, `@supabase/auth-ui-shared`

---

## Phase 2: Database Migration + RLS (~2 days)

### 2A: Schema Changes

Add `user_id uuid REFERENCES auth.users(id)` to:
- `user_vocabulary` — change unique from `(vocabulary_id)` to `(user_id, vocabulary_id)`
- `user_settings` — replace `id int DEFAULT 1` with `user_id uuid UNIQUE`
- `sessions` — add user_id
- `exchanges` — add user_id
- `review_log` — add user_id
- `mistake_patterns` — add user_id
- `shadowing_attempts` — add user_id
- `usage_log` — already has user_id from Phase 0

`vocabulary` stays global (shared dictionary). Correct as-is.

### 2B: RLS Policies

Replace all `USING (true)` policies with:
```sql
CREATE POLICY "Users see own data" ON user_vocabulary
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Repeat for all user-scoped tables
```

`vocabulary` table: keep `USING (true)` for SELECT, restrict INSERT/UPDATE to service role.

### 2C: Indexes

Add `CREATE INDEX idx_{table}_user_id ON {table}(user_id)` for all user-scoped tables.

**Files to modify:**
- `database/schema.sql`
- `supabase/migrations/` — new migration file
- Apply via Supabase SQL Editor dashboard

---

## Phase 3: Data Layer User-Scoping (~2-3 days)

### 3A: `db.js` — Supabase Queries

With proper RLS, most queries don't need explicit `.eq('user_id', userId)` — RLS handles filtering automatically when the Supabase client is initialized with the user's JWT. But INSERT/UPSERT must include `user_id`.

Key changes:
- `getSettings()` — remove `.single()` hack, RLS scopes it
- `saveSettings()` — remove `id: 1`, include `user_id`
- `upsertWord()` — include `user_id` in upsert
- `createSession()` / `saveExchange()` — include `user_id`
- Initialize Supabase client with user's access token: `supabase.auth.setSession()`

**Files to modify:**
- `src/utils/db.js` — all exported functions
- `src/utils/localDb.js` — prefix all keys with userId (`${userId}_mt_settings`, etc.), add `clearUserData()` for logout

### 3B: Component Updates

Thread `userId` (from `supabase.auth.getUser()`) through components that call db functions:
- `src/components/ConversationScreen.jsx`
- `src/components/FlashcardScreen.jsx`
- `src/components/Dashboard.jsx`
- `src/components/SettingsScreen.jsx`
- `src/components/SessionSummary.jsx`
- `src/components/TopicSelector.jsx`

---

## Phase 4: Billing with Lemon Squeezy (~3-4 days)

### 4A: Lemon Squeezy Setup

- Create product + single variant ($15/mo) in Lemon Squeezy dashboard
- Set up 14-day free trial on the variant
- Configure webhook endpoint

### 4B: Subscription Schema

```sql
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) UNIQUE,
  lemon_squeezy_id text,
  status text NOT NULL DEFAULT 'trial',  -- trial, active, cancelled, expired
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 4C: API Endpoints

- **New:** `api/lemonsqueezy-webhook.js` — handle subscription created/updated/cancelled events, update `subscriptions` table
- **New:** `api/create-checkout.js` — generate Lemon Squeezy checkout URL for authenticated user

### 4D: Subscription Gating

- Add subscription check middleware to `api/chat.js`: query `subscriptions` table, reject if expired/cancelled
- `src/App.jsx` or new `src/components/PaywallScreen.jsx` — show upgrade prompt when trial expires
- Usage limits: track daily conversation count in `usage_log`, enforce limit (e.g., 20 convos/day as safety net)

### 4E: Account Management

- **New:** `src/components/AccountScreen.jsx` — show subscription status, link to Lemon Squeezy customer portal for cancellation/billing changes

**New dependency:** `@lemonsqueezy/lemonsqueezy.js`

---

## Phase 5: Production Hardening (~2 days)

- Per-user rate limiting on `/api/chat` (e.g., 60 req/hour) and `/api/speech-token`
- CORS configuration for production domain
- Error monitoring — add Sentry with user context
- Logout flow: clear localStorage, redirect to auth screen
- Basic landing page (can be a simple static page on Vercel)
- Terms of Service / Privacy Policy (required for Lemon Squeezy)

---

## What Does NOT Change

- Claude conversation logic (`claudePrompt.js` system prompts — structure stays the same)
- FSRS scheduling algorithm (`ts-fsrs`)
- Azure Speech SDK integration (`useAzureSpeech.js`, `useAzureTTS.js` — just add auth headers to token fetch)
- Pronunciation scoring and coloring
- Word segmentation (`segmentWords.js`, `cedict.txt`)
- UI components' visual design and layout

---

## Cost Analysis

| Service | Current (1 user) | Multi-tenant |
|---------|-------------------|-------------|
| Claude API (Sonnet) | ~$5-20/mo | ~$0.18/conversation after optimization |
| Azure Speech | Free tier | $1/hr STT, $16/1M chars TTS |
| Supabase | Free tier | Pro plan ($25/mo) for auth + connections |
| Vercel | Free tier | Pro ($20/mo) for serverless limits |
| Lemon Squeezy | N/A | 5% + $0.50/txn |

**Unit economics at $15/mo per user:**
- With sliding window optimization, a user doing 5 convos/day costs ~$27/mo in Claude API
- Need usage caps: 20 convos/day limit keeps power user cost at ~$108/mo (still a loss on heavy users)
- Average user likely does 1-3 convos/day → ~$5-16/mo in API costs → profitable
- Revenue needs to exceed: $25 Supabase + $20 Vercel + avg API cost per user × user count

---

## Verification Plan

| Phase | Test |
|-------|------|
| 0 | Run a 20-turn conversation, verify token count in `usage_log` is ~50% lower than current |
| 1 | Two users can log in/out independently on the same browser |
| 2 | User A's vocab/sessions/settings are invisible to User B (test via Supabase SQL editor with different JWTs) |
| 3 | Full flow works per-user: topic select → chat → save vocab → flashcard review → dashboard stats |
| 4 | New user gets 14-day trial → trial expires → paywall shown → checkout → subscription active → app works |
| 5 | Rate limiting triggers at threshold, Sentry captures errors with user context |
