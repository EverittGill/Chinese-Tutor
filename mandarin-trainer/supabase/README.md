# Supabase Directory

Supabase configuration and database migrations.

## Files

| File | Purpose |
|------|---------|
| `config.toml` | Supabase local dev configuration (auth settings, API config) |
| `migrations/` | SQL migration files applied to Supabase |

## Migrations

Applied in order by timestamp prefix:

| Migration | Purpose |
|-----------|---------|
| `20260318220059_beta_multi_tenant.sql` | Multi-tenant schema: adds `user_id` to all user-scoped tables, creates `user_credits`, `promo_codes`, `promo_redemptions`, `api_usage_log` tables, RLS policies, `redeem_promo_code()` function, seeds BETA2024 and FRIEND25 promo codes |
| `20260319022544_auto_create_user_credits.sql` | `handle_new_user` trigger: auto-creates a `user_credits` row (balance 0) when a new user signs up via Supabase Auth |

## Database Tables

### User-Scoped (filtered by `user_id` via RLS)
- `user_settings` — preferences and streaks
- `user_vocabulary` — per-user word progress + FSRS scheduling fields
- `sessions` — conversation sessions
- `exchanges` — individual conversation turns
- `review_log` — FSRS review attempts (rating 1-4)
- `mistake_patterns` — tracked error patterns
- `shadowing_attempts` — pronunciation practice attempts
- `user_credits` — credit balance and total spent (microdollars)
- `promo_redemptions` — which user redeemed which code
- `api_usage_log` — per-request cost tracking

### Shared
- `vocabulary` — dictionary (word UNIQUE, pinyin, english, hsk_level). Readable/writable by all authenticated users.
- `promo_codes` — code, credit_amount, max_uses, current_uses, active. Read-only for authenticated users.

## How to Apply Schema Changes

Migrations are tracked in this directory but must be **applied manually** via the Supabase SQL Editor (Dashboard -> SQL Editor -> paste and run). The Supabase CLI is not used for deployment.

## Key RLS Pattern

All user-scoped tables use:
```sql
CREATE POLICY "Users own data" ON <table>
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

This means SELECTs in `db.js` don't need explicit `user_id` filters — RLS handles it automatically.
