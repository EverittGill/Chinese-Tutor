-- ============================================
-- Beta Multi-Tenant Migration
-- Adds user_id to all user-scoped tables,
-- creates credits/promo system, updates RLS
-- ============================================

-- 1A. Add user_id to all user-scoped tables
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE user_vocabulary ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE exchanges ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE review_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE mistake_patterns ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE shadowing_attempts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Fix unique constraints for multi-user
ALTER TABLE user_vocabulary DROP CONSTRAINT IF EXISTS user_vocabulary_vocabulary_id_key;
ALTER TABLE user_vocabulary ADD CONSTRAINT user_vocabulary_user_vocab_unique UNIQUE (user_id, vocabulary_id);

-- user_settings: one row per user instead of hardcoded id=1
ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_id_unique UNIQUE (user_id);

-- 1B. New tables
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  balance INTEGER DEFAULT 0 NOT NULL,
  total_spent INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  credit_amount INTEGER NOT NULL,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  promo_code_id UUID REFERENCES promo_codes(id) NOT NULL,
  credited_amount INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, promo_code_id)
);

CREATE TABLE IF NOT EXISTS api_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1C. RLS Policies

-- Enable RLS on new tables
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

-- Drop old permissive "Allow all" policies on existing tables
DROP POLICY IF EXISTS "Allow all" ON user_settings;
DROP POLICY IF EXISTS "Allow all" ON user_vocabulary;
DROP POLICY IF EXISTS "Allow all" ON sessions;
DROP POLICY IF EXISTS "Allow all" ON exchanges;
DROP POLICY IF EXISTS "Allow all" ON review_log;
DROP POLICY IF EXISTS "Allow all" ON mistake_patterns;
DROP POLICY IF EXISTS "Allow all" ON shadowing_attempts;
DROP POLICY IF EXISTS "Allow all" ON vocabulary;

-- User-scoped tables: users can only access their own data
CREATE POLICY "Users own data" ON user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON user_vocabulary FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON exchanges FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON review_log FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON mistake_patterns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON shadowing_attempts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON user_credits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON promo_redemptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users own data" ON api_usage_log FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- vocabulary: shared dictionary, readable/writable by authenticated users
CREATE POLICY "Auth read vocab" ON vocabulary FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth write vocab" ON vocabulary FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update vocab" ON vocabulary FOR UPDATE USING (auth.role() = 'authenticated');

-- promo_codes: read-only for authenticated users
CREATE POLICY "Auth read promos" ON promo_codes FOR SELECT USING (auth.role() = 'authenticated' AND active = true);

-- 1D. Atomic promo code redemption function
CREATE OR REPLACE FUNCTION redeem_promo_code(p_code TEXT, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_promo FROM promo_codes
  WHERE code = p_code AND active = true FOR UPDATE;

  IF v_promo IS NULL THEN
    RETURN '{"success":false,"error":"Invalid or expired code"}'::json;
  END IF;

  IF v_promo.current_uses >= v_promo.max_uses THEN
    RETURN '{"success":false,"error":"Code fully redeemed"}'::json;
  END IF;

  IF EXISTS(SELECT 1 FROM promo_redemptions WHERE user_id = p_user_id AND promo_code_id = v_promo.id) THEN
    RETURN '{"success":false,"error":"Already used this code"}'::json;
  END IF;

  UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = v_promo.id;

  INSERT INTO promo_redemptions (user_id, promo_code_id, credited_amount)
  VALUES (p_user_id, v_promo.id, v_promo.credit_amount);

  INSERT INTO user_credits (user_id, balance)
  VALUES (p_user_id, v_promo.credit_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + v_promo.credit_amount, updated_at = now();

  RETURN json_build_object('success', true, 'credited', v_promo.credit_amount,
    'balance', (SELECT balance FROM user_credits WHERE user_id = p_user_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1E. Seed beta promo codes
INSERT INTO promo_codes (code, credit_amount, max_uses) VALUES
  ('BETA2024', 25000000, 50),
  ('FRIEND25', 25000000, 10)
ON CONFLICT (code) DO NOTHING;
