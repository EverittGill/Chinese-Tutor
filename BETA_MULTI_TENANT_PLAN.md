# Beta Multi-User Plan: Auth, Credits & Promo Codes

## Context

The app is currently single-user with no authentication. To let beta testers try it, we need: Supabase Auth (signup/login/logout), user data isolation (so testers don't see each other's data), a credit system tracking real API costs, and promo codes to give testers ~$25 of credits. This is NOT the full SaaS build — just enough to hand someone a link and let them get started.

---

## Step 1: SQL Schema Migration (apply in Supabase SQL Editor)

### 1A. Add `user_id` to all user-scoped tables

```sql
ALTER TABLE user_settings ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE user_vocabulary ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE sessions ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE exchanges ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE review_log ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE mistake_patterns ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE shadowing_attempts ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Fix unique constraints for multi-user
ALTER TABLE user_vocabulary DROP CONSTRAINT IF EXISTS user_vocabulary_vocabulary_id_key;
ALTER TABLE user_vocabulary ADD CONSTRAINT user_vocabulary_user_vocab_unique UNIQUE (user_id, vocabulary_id);

ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_pkey;
ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_id_unique UNIQUE (user_id);
```

### 1B. New tables: credits, promo codes, usage tracking

Store costs in **microdollars** (integer, 1,000,000 = $1). Sonnet: 3 microdollars/input token, 15/output. Haiku: round to 1/input, 2/output.

```sql
CREATE TABLE user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  balance INTEGER DEFAULT 0 NOT NULL,
  total_spent INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  credit_amount INTEGER NOT NULL,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE promo_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  promo_code_id UUID REFERENCES promo_codes(id) NOT NULL,
  credited_amount INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, promo_code_id)
);

CREATE TABLE api_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 1C. RLS policies

Drop existing "Allow all" policies, then create proper ones:

```sql
-- For each user-scoped table (user_settings, user_vocabulary, sessions,
-- exchanges, review_log, mistake_patterns, shadowing_attempts,
-- user_credits, promo_redemptions, api_usage_log):
CREATE POLICY "Users own data" ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- vocabulary stays globally readable by authenticated users
CREATE POLICY "Auth read vocab" ON vocabulary
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth write vocab" ON vocabulary
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update vocab" ON vocabulary
  FOR UPDATE USING (auth.role() = 'authenticated');

-- promo_codes: read-only for authenticated users
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read promos" ON promo_codes
  FOR SELECT USING (auth.role() = 'authenticated' AND active = true);
```

### 1D. Atomic promo code redemption function

```sql
CREATE OR REPLACE FUNCTION redeem_promo_code(p_code TEXT, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_promo FROM promo_codes
  WHERE code = p_code AND active = true FOR UPDATE;

  IF v_promo IS NULL THEN RETURN '{"success":false,"error":"Invalid or expired code"}'::json; END IF;
  IF v_promo.current_uses >= v_promo.max_uses THEN RETURN '{"success":false,"error":"Code fully redeemed"}'::json; END IF;
  IF EXISTS(SELECT 1 FROM promo_redemptions WHERE user_id = p_user_id AND promo_code_id = v_promo.id) THEN
    RETURN '{"success":false,"error":"Already used this code"}'::json;
  END IF;

  UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = v_promo.id;
  INSERT INTO promo_redemptions (user_id, promo_code_id, credited_amount) VALUES (p_user_id, v_promo.id, v_promo.credit_amount);
  INSERT INTO user_credits (user_id, balance) VALUES (p_user_id, v_promo.credit_amount)
    ON CONFLICT (user_id) DO UPDATE SET balance = user_credits.balance + v_promo.credit_amount, updated_at = now();

  RETURN json_build_object('success', true, 'credited', v_promo.credit_amount,
    'balance', (SELECT balance FROM user_credits WHERE user_id = p_user_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 1E. Seed beta promo codes

```sql
INSERT INTO promo_codes (code, credit_amount, max_uses) VALUES
  ('BETA2024', 25000000, 50),   -- $25, 50 uses
  ('FRIEND25', 25000000, 10);   -- $25, 10 uses
```

### 1F. Migrate existing data

After signing up with your own account, assign your existing data:
```sql
UPDATE user_settings SET user_id = '<your-uuid>' WHERE user_id IS NULL;
UPDATE user_vocabulary SET user_id = '<your-uuid>' WHERE user_id IS NULL;
-- etc. for all tables
```

---

## Step 2: Auth Context + Supabase Client

### New file: `src/contexts/AuthContext.jsx`

React context providing `{ user, loading, credits, signUp, signIn, signOut, getAccessToken, refreshCredits }`.

- On mount: `supabase.auth.getSession()` + subscribe to `onAuthStateChange`
- When user changes: fetch `user_credits` balance
- `getAccessToken()` returns `session.access_token` for API calls
- `refreshCredits()` re-fetches balance from `user_credits`

### Modify: `src/App.jsx`

- Wrap with `<AuthProvider>`
- Gate flow: loading → AuthScreen (no user) → PromoCodeScreen (no credits) → existing app
- No changes to existing screen state machine

### Supabase Dashboard config (manual steps)

1. **Keep email confirmation ON** (default) — prevents users creating throwaway accounts for free credits
2. **Set Site URL** — Authentication → URL Configuration → `https://mandarin-trainer.vercel.app`
3. **Add Redirect URLs** — same section, add `https://mandarin-trainer.vercel.app` and `http://localhost:3000`
4. **Get Service Role Key** — Settings → API → copy `service_role` key → add as `SUPABASE_SERVICE_ROLE_KEY` to `.env` and Vercel

---

## Step 3: Auth Screen

### New file: `src/components/AuthScreen.jsx`

- Two tabs: Sign In / Sign Up
- Fields: email + password
- Uses `useAuth()` for `signIn`/`signUp`
- After signup: show "Check your email to verify your account" message (email confirmation required to prevent abuse)
- After clicking confirmation link: user is redirected back to app and auto-logged in
- Error display for Supabase errors
- Match existing warm theme (brand-600 buttons, warm-50 bg, rounded-2xl)

---

## Step 4: Promo Code Screen + Credit Display

### New file: `src/components/PromoCodeScreen.jsx`

- Shown after login when user has 0 credits
- Text input for promo code → calls `supabase.rpc('redeem_promo_code', { p_code, p_user_id })`
- On success: `refreshCredits()` → App re-renders into main app

### Modify: `src/components/TopicSelector.jsx`

- Show credit balance in header: `$X.XX remaining` (microdollars / 1,000,000)

### Modify: `src/components/SettingsScreen.jsx`

- Add Account section: email display, credit balance, "Redeem Code" button, "Sign Out" button

### Out-of-credits handling

- When `useConversation` or other fetches get a 402 response, surface a specific error message with option to enter another promo code

---

## Step 5: API Auth + Credit Deduction

### New file: `api/authMiddleware.js`

Server-side helpers using **Supabase service role key** (new env var: `SUPABASE_SERVICE_ROLE_KEY`):

- `authenticateRequest(req)` — validate JWT from `Authorization: Bearer <token>` header
- `checkCredits(userId)` — query `user_credits.balance`
- `deductCredits(userId, cost, model, inputTokens, outputTokens, endpoint)` — subtract from balance, log to `api_usage_log`
- `calculateCost(model, inputTokens, outputTokens)` — rates: Sonnet 3/15 microdollars per input/output token, Haiku 1/2

### Modify: `api/chat.js`

1. Call `authenticateRequest(req)` → 401 if invalid
2. Call `checkCredits(user.id)` → 402 if insufficient
3. After Claude call: capture `response.usage.input_tokens` / `output_tokens`
4. After translateWords calls: capture their usage too (requires modifying `translateWords` to return usage)
5. Sum all costs → `deductCredits()` → return `credits.remaining` in response

### Modify: `api/translateWords.js`

- Return `{ words, pinyin, usage: { input_tokens, output_tokens } }` from the Haiku call
- `chat.js` aggregates all usage for total cost

### Modify: `api/speech-token.js`

- Add `authenticateRequest(req)` check (no credit deduction — absorb Azure costs for beta)

### Modify: `server.js`

- Import and apply same auth + credit logic to Express routes
- Consider: have `server.js` import the handler from `api/chat.js` instead of duplicating it (reduces maintenance)

---

## Step 6: Authenticated Fetch + db.js Multi-User

### New file: `src/utils/apiFetch.js`

Wrapper around `fetch` that:
- Gets current session token from `supabase.auth.getSession()`
- Adds `Authorization: Bearer <token>` header
- Handles 402 (out of credits) with a typed `CreditError`

### Modify fetch call sites (4 locations):
- `src/hooks/useConversation.js:17` — `fetch('/api/chat')` → `apiFetch('/api/chat')`
- `src/utils/config.js:11` — `fetch('/api/speech-token')` → `apiFetch('/api/speech-token')`
- `src/components/VocabImport.jsx:98` — `fetch('/api/chat')` → `apiFetch('/api/chat')`
- `src/components/SessionSummary.jsx:25` — `fetch('/api/chat')` → `apiFetch('/api/chat')`

### Modify: `src/utils/db.js`

- Add helper: `getCurrentUserId()` using `supabase.auth.getUser()`
- All INSERT/UPSERT functions: include `user_id` in the data
- `saveSettings`: change `{ id: 1, ...settings }` → `{ user_id, ...settings }`, upsert on `user_id`
- `upsertWord`: change onConflict from `'vocabulary_id'` → `'user_id, vocabulary_id'`
- SELECTs: RLS handles filtering automatically (no explicit user_id filter needed)
- `getSettings`: handle case where no row exists yet (new user)

### Modify: `src/utils/localDb.js`

- Disable localStorage fallback when Supabase auth is active (multi-user can't share localStorage safely)
- In `db.js`, if user is authenticated, always use Supabase even if it errors — don't fall back to localStorage

---

## New Environment Variables

```
SUPABASE_SERVICE_ROLE_KEY=<from Supabase Dashboard → Settings → API>
```

Add to both `.env` (local dev) and Vercel environment variables.

---

## Files Summary

### New files (5)
| File | Purpose |
|------|---------|
| `src/contexts/AuthContext.jsx` | Auth state, credits, session management |
| `src/components/AuthScreen.jsx` | Login/signup UI |
| `src/components/PromoCodeScreen.jsx` | Promo code entry |
| `src/utils/apiFetch.js` | Authenticated fetch wrapper |
| `api/authMiddleware.js` | Server-side JWT + credit functions |

### Modified files (9)
| File | Changes |
|------|---------|
| `src/App.jsx` | AuthProvider wrapper, auth/credit gating |
| `src/utils/db.js` | Add user_id to all writes, getCurrentUserId helper |
| `src/hooks/useConversation.js` | Use apiFetch, handle 402/credits |
| `src/utils/config.js` | Use apiFetch for speech token |
| `src/components/VocabImport.jsx` | Use apiFetch |
| `src/components/SessionSummary.jsx` | Use apiFetch |
| `src/components/TopicSelector.jsx` | Credit balance display |
| `src/components/SettingsScreen.jsx` | Account section, logout, redeem code |
| `api/chat.js` | Auth check, credit check/deduction, usage tracking |
| `api/translateWords.js` | Return usage data |
| `api/speech-token.js` | Auth check |
| `server.js` | Auth + credit middleware on Express routes |

---

## Verification

1. **Sign up flow**: Visit app → see AuthScreen → create account → see PromoCodeScreen → enter "BETA2024" → see TopicSelector with $25.00 balance
2. **Data isolation**: Sign up as two different users → each should have independent vocab, settings, sessions
3. **Credit deduction**: Have a conversation → check that credit balance decreased (a typical exchange costs ~$0.01-0.03)
4. **Out of credits**: Manually set balance to 0 in Supabase → try to chat → should get 402 error with appropriate UI message
5. **Logout/login**: Sign out → sign back in → data persists
6. **API protection**: Try calling `/api/chat` without auth header → should get 401
