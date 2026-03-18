-- Mandarin Trainer Database Schema (v2)
-- Normalized: vocabulary (dictionary) + user_vocabulary (progress/FSRS)
-- Run in Supabase SQL Editor or via `supabase db push`

-- Drop old tables (database is empty, safe to rebuild)
DROP TABLE IF EXISTS exchanges CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS vocabulary CASCADE;
DROP TABLE IF EXISTS mistake_patterns CASCADE;

-- ============================================================
-- vocabulary: pure dictionary — one row per unique word
-- ============================================================
CREATE TABLE vocabulary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  word text NOT NULL UNIQUE,
  pinyin text NOT NULL,
  english text NOT NULL,
  hsk_level int,
  part_of_speech text,
  measure_word text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- user_vocabulary: user's relationship with each word (FSRS-ready)
-- ============================================================
CREATE TABLE user_vocabulary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vocabulary_id uuid NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new',  -- 'new', 'learning', 'review', 'known'
  context_sentence text,
  source text DEFAULT 'conversation',  -- 'conversation', 'import', 'class'
  -- FSRS scheduling fields
  difficulty float DEFAULT 0,
  stability float DEFAULT 0,
  retrievability float DEFAULT 1,
  reps int DEFAULT 0,
  lapses int DEFAULT 0,
  state int DEFAULT 0,  -- 0=New, 1=Learning, 2=Review, 3=Relearning
  due_date timestamptz DEFAULT now(),
  last_reviewed timestamptz,
  -- Performance tracking
  times_seen int DEFAULT 0,
  times_correct int DEFAULT 0,
  times_incorrect int DEFAULT 0,
  accuracy_avg float DEFAULT 0,
  tone_accuracy_avg float DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(vocabulary_id)
);

-- ============================================================
-- review_log: every SRS review attempt (feeds FSRS optimizer)
-- ============================================================
CREATE TABLE review_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_vocabulary_id uuid NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  rating int NOT NULL,  -- 1=Again, 2=Hard, 3=Good, 4=Easy
  review_duration_ms int,
  scheduled_days float,
  actual_days float,
  reviewed_at timestamptz DEFAULT now()
);

-- ============================================================
-- user_settings: single row for preferences/streaks
-- ============================================================
CREATE TABLE user_settings (
  id int PRIMARY KEY DEFAULT 1,
  user_name text,
  user_context text,
  tts_voice text DEFAULT 'zh-CN-XiaoxiaoNeural',
  target_hsk_level int DEFAULT 3,
  daily_goal_minutes int DEFAULT 15,
  current_streak int DEFAULT 0,
  longest_streak int DEFAULT 0,
  last_practice_date date,
  preferred_tts_speed float DEFAULT 1.0,
  pinyin_display_mode int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- sessions: one row per conversation session
-- ============================================================
CREATE TABLE sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic text,
  target_hsk_level int,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  exchange_count int DEFAULT 0,
  avg_accuracy float,
  avg_fluency float,
  summary_json jsonb,
  corrections_json jsonb,
  new_words_json jsonb
);

-- ============================================================
-- exchanges: individual turns within a session
-- ============================================================
CREATE TABLE exchanges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  turn_number int NOT NULL,
  user_text text,
  user_pronunciation_score float,
  user_fluency_score float,
  user_word_scores jsonb,
  ai_response_json jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- mistake_patterns: aggregated across sessions
-- ============================================================
CREATE TABLE mistake_patterns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type text NOT NULL,
  description text NOT NULL,
  example_original text,
  example_corrected text,
  occurrence_count int DEFAULT 1,
  last_occurred_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- shadowing_attempts: for sentence shadowing mode
-- ============================================================
CREATE TABLE shadowing_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  reference_text text NOT NULL,
  reference_pinyin text,
  user_pronunciation_score float,
  user_fluency_score float,
  word_scores jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_user_vocabulary_due_date ON user_vocabulary(due_date);
CREATE INDEX idx_user_vocabulary_status ON user_vocabulary(status);
CREATE INDEX idx_user_vocabulary_vocabulary_id ON user_vocabulary(vocabulary_id);
CREATE INDEX idx_review_log_user_vocabulary_id ON review_log(user_vocabulary_id);
CREATE INDEX idx_sessions_started_at ON sessions(started_at);
CREATE INDEX idx_exchanges_session_id ON exchanges(session_id);

-- ============================================================
-- Row Level Security (open for single-user with anon key)
-- ============================================================
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistake_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE shadowing_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON vocabulary FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON user_vocabulary FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON review_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON user_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON exchanges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON mistake_patterns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON shadowing_attempts FOR ALL USING (true) WITH CHECK (true);
