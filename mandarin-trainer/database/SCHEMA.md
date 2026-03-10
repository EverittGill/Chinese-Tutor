# Database Schema v2 — Normalized Design

## Overview

The schema was reworked from a single `vocabulary` table (that conflated word definitions with user progress) into a normalized design that separates dictionary data from learning state. This unblocks FSRS spaced repetition, context sentences, and future features like sentence shadowing.

## Tables

### `vocabulary` — Dictionary
One row per unique Chinese word. Pure reference data, no user state.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| word | text UNIQUE | Simplified Chinese characters |
| pinyin | text | Tone-marked pinyin |
| english | text | English definition |
| hsk_level | int | HSK level (1-6), nullable |
| part_of_speech | text | e.g. "noun", "verb", nullable |
| measure_word | text | Associated measure word, nullable |
| created_at | timestamptz | |

### `user_vocabulary` — User Progress + FSRS
One row per word the user is tracking. Links to `vocabulary` via FK.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| vocabulary_id | uuid FK UNIQUE | References vocabulary(id) |
| status | text | 'new', 'learning', 'review', 'known' |
| context_sentence | text | Example sentence from conversation |
| source | text | 'conversation', 'import', 'class' |
| difficulty | float | FSRS difficulty parameter |
| stability | float | FSRS stability parameter |
| retrievability | float | FSRS retrievability (0-1) |
| reps | int | Total successful reviews |
| lapses | int | Times forgotten (rated Again) |
| state | int | FSRS state: 0=New, 1=Learning, 2=Review, 3=Relearning |
| due_date | timestamptz | When next review is due |
| last_reviewed | timestamptz | |
| times_seen | int | Total encounters (conversation + review) |
| times_correct | int | |
| times_incorrect | int | |
| accuracy_avg | float | Running average pronunciation score |
| tone_accuracy_avg | float | Reserved for future tone scoring |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `review_log` — SRS Review History
Every individual review attempt, used by FSRS optimizer.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_vocabulary_id | uuid FK | References user_vocabulary(id) |
| rating | int | 1=Again, 2=Hard, 3=Good, 4=Easy |
| review_duration_ms | int | Time from reveal to rating |
| scheduled_days | float | Days FSRS scheduled until next review |
| actual_days | float | Days since last review |
| reviewed_at | timestamptz | |

### `user_settings` — Preferences
Single row for app preferences and streak tracking.

### `sessions` — Conversation Sessions
Added `target_hsk_level` column.

### `exchanges` — Conversation Turns
Unchanged from v1.

### `mistake_patterns` — Error Tracking
Unchanged from v1.

### `shadowing_attempts` — Sentence Shadowing
New table for Plan 05.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| session_id | uuid FK | References sessions(id) |
| reference_text | text | Target Chinese sentence |
| reference_pinyin | text | |
| user_pronunciation_score | float | |
| user_fluency_score | float | |
| word_scores | jsonb | Per-word Azure scores |
| created_at | timestamptz | |

## Indexes

- `user_vocabulary(due_date)` — "what's due today?" query for flashcards
- `user_vocabulary(status)` — filter by learning state
- `user_vocabulary(vocabulary_id)` — FK lookups
- `review_log(user_vocabulary_id)` — review history per word
- `sessions(started_at)` — recent sessions
- `exchanges(session_id)` — exchanges per session

## Migration from v1

The database was empty at migration time, so the schema does a full `DROP TABLE IF EXISTS CASCADE` and recreates everything. No data migration was needed.

## Applying the Schema

No Supabase CLI is installed. To apply:
1. Open the Supabase Dashboard → SQL Editor
2. Paste the contents of `database/schema.sql`
3. Run the query

## localStorage Fallback

`localDb.js` mirrors the normalized schema using two separate stores:
- `mt_vocab_dict` — dictionary entries (equivalent to `vocabulary` table)
- `mt_user_vocab` — user progress (equivalent to `user_vocabulary` table)
- `mt_review_log` — review history (equivalent to `review_log` table)
