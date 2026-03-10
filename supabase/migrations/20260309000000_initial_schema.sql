-- Mandarin Trainer Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Vocabulary: every word the user has encountered
CREATE TABLE vocabulary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  word text NOT NULL UNIQUE,
  pinyin text NOT NULL,
  english text NOT NULL,
  hsk_level int,
  status text NOT NULL DEFAULT 'new',  -- 'new', 'learning', 'known'
  times_seen int DEFAULT 0,
  times_correct int DEFAULT 0,
  times_incorrect int DEFAULT 0,
  accuracy_avg float DEFAULT 0,
  last_seen_at timestamptz,
  notes text,
  source text DEFAULT 'conversation',  -- 'conversation', 'import', 'class'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Sessions: one row per conversation session
CREATE TABLE sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  exchange_count int DEFAULT 0,
  avg_accuracy float,
  avg_fluency float,
  summary_json jsonb,
  corrections_json jsonb,
  new_words_json jsonb
);

-- Exchanges: individual turns within a session
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

-- Mistake patterns: aggregated across sessions
CREATE TABLE mistake_patterns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type text NOT NULL,  -- 'grammar', 'vocabulary', 'pronunciation', 'tone'
  description text NOT NULL,
  example_original text,
  example_corrected text,
  occurrence_count int DEFAULT 1,
  last_occurred_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Open RLS for single user with anon key
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistake_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON vocabulary FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON exchanges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON mistake_patterns FOR ALL USING (true) WITH CHECK (true);
