# Mandarin Trainer: Effectiveness Assessment vs. Research

> Assessment date: 2026-03-17
> Compared against: LANGUAGE_LEARNING_RESEARCH.md

## How effective is this tool right now?

**Short answer: Surprisingly strong.** The app covers most P0 requirements from the research and several P1s. The core loop — speak with an AI tutor, get corrections, learn vocabulary, review with SRS — is exactly what the research says matters most. Where it falls short is mostly in polish, depth, and a few missing features that would compound its effectiveness over time.

---

## Scorecard: Research Recommendations vs. What We Have

### Evidence-Based Methods (Section 1)

| Method | Status | Notes |
|--------|--------|-------|
| **SRS (FSRS)** | DONE | Full FSRS with ts-fsrs, ratings 1-4, due dates, review logging. Matches the research recommendation exactly. |
| **Comprehensible Input (i+1)** | DONE | Claude prompt explicitly calibrates to HSK 2-3, introduces 1 new word per exchange, adapts via vocab context + level analysis. Teacher mode has explicit i+1 calibration. |
| **Active Recall** | DONE | Flashcard screen requires recall before reveal. Timer-tracked. |
| **Forgetting Curve** | DONE | FSRS handles this automatically. Words reviewed at optimal intervals. |
| **Immersion** | PARTIAL | 3 display modes (Chinese only / +pinyin / +english) let you progressively remove scaffolding. But no "immersion mode" where the UI itself switches to Chinese. No graded reading content. |
| **Shadowing** | PARTIAL | PronunciationScreen does listen-then-repeat with scoring, but it's sentence drills from vocab context — not true simultaneous shadowing. Table exists for tracking, UI is basic. |

### Key Effectiveness Features (Section 3)

| Feature | Status | Notes |
|---------|--------|-------|
| **Adaptive Difficulty** | DONE | Vocab context (known/learning/next), HSK distribution analysis, mistake patterns, cross-session learner briefing, session focus instructions. This is genuinely sophisticated. |
| **Immediate Feedback** | DONE | Corrections appear inline via CorrectionPanel after each exchange. Recast approach matches research recommendation exactly (model correct form, brief explanation, continue). |
| **Context-Rich Learning** | DONE | Words always introduced in conversation context. Context sentences persisted with vocabulary. SRS cards show context. |
| **Multi-Modal (4 skills)** | PARTIAL | Listening (TTS), Speaking (STT + pronunciation scoring), Reading (conversation text) — all strong. Writing is the gap: no character writing, no free-form text input practice. |
| **Gamification** | WEAK | No streaks, no XP, no levels, no badges. Dashboard shows stats but nothing motivational. Research says streaks + progress visibility drive habit formation. |
| **Progress Tracking** | PARTIAL | Dashboard has: vocab counts, 30-day pronunciation trend, recent sessions, common mistakes. Missing: HSK progress bar, tone-specific accuracy, vocabulary heatmap, estimated HSK level display. |
| **Conversation with Corrections** | DONE | This is the app's strongest feature. 3 conversation modes (normal, review, teacher), consistent persona, inline corrections with type/explanation, recast approach, max 3 corrections per exchange. |
| **Cultural Context** | WEAK | Scenario topics (restaurant, shopping) provide situational context, but no explicit cultural notes, register guidance, or festival vocabulary. |

### Mandarin-Specific Challenges (Section 4)

| Challenge | Status | Notes |
|-----------|--------|-------|
| **Tonal System** | PARTIAL | Azure provides word-level accuracy scores. Pronunciation coloring (green/yellow/red). PronunciationFeedback gives tone descriptions. But NO per-tone accuracy tracking, no tone-color coding (research recommends 1st=red, 2nd=orange, etc.), no minimal pair exercises, no tone contour visualization. |
| **Character Recognition** | NOT IMPLEMENTED | No radical decomposition, no stroke order animation, no character-specific SRS track. Research notes top 100 chars = 42% coverage — this frequency-based approach isn't used. |
| **Pinyin as Bridge** | DONE | Toggle-able pinyin display (3 modes), pinyin in word breakdowns, pinyin in corrections. Could add: progressive pinyin fading based on demonstrated recognition. |
| **Measure Words** | PARTIAL | Teacher mode system prompt explicitly lists measure words as a grammar priority. But no dedicated tracking or drill. |
| **HSK Level Mapping** | PARTIAL | System prompt targets HSK 2-3. Level context includes HSK distribution analysis. But no HSK word lists pre-loaded, no HSK progress bar, no explicit level setting by user (only in session focus). |

### Ideal Tool Requirements (Section 6)

| Feature | Priority | Status |
|---------|----------|--------|
| AI Conversation Partner | P0 | DONE — 3 modes, adaptive, corrective |
| Speech Recognition | P0 | DONE — Azure STT with word-level scoring |
| Text-to-Speech | P0 | DONE — Azure Neural TTS, 12 voices, rate control |
| SRS Vocabulary System | P0 | DONE — FSRS with full tracking |
| Pinyin Display | P0 | DONE — 3-mode toggle |
| Word-Level Interaction | P0 | DONE — ClickableWord with popover (pinyin, english, score) |
| Progress Tracking | P1 | PARTIAL — basics done, missing HSK bar + tone charts |
| Tone Practice | P1 | PARTIAL — scoring exists, dedicated practice missing |
| HSK Level Mapping | P1 | PARTIAL — in prompts but not in vocab system |
| Gamification | P1 | WEAK — streaks/XP not implemented |
| Session Summaries | P1 | DONE — AI-generated with assessment, strengths, practice sentences |
| Adaptive Difficulty | P1 | DONE — multi-signal adaptation |
| Character Stroke Order | P2 | NOT DONE |
| Shadowing Mode | P2 | PARTIAL — pronunciation drills exist |
| Reading Practice | P2 | NOT DONE |
| Writing Practice | P2 | NOT DONE |

---

## Strengths (What's Working Well)

1. **The core conversation loop is research-validated.** Comprehensible input + immediate corrections + contextual vocab acquisition + SRS review. This is exactly what the research says works.

2. **Cross-session memory is a differentiator.** The learner briefing system (recent sessions, strengths, weaknesses, suggested topics) means the AI remembers you across sessions. General-purpose LLMs don't do this. The research explicitly calls this out as a weakness of ChatGPT/Claude.

3. **Teacher mode is pedagogically sound.** i+1 calibration, recast approach, grammar priorities mapped to Mandarin-specific challenges (aspect markers, topic-comment, measure words). This addresses the research's "grammar as a tool, not a goal" recommendation.

4. **Pronunciation scoring is granular.** Word-level accuracy with visual feedback, pronunciation-aware corrections from Claude, dedicated practice screen. Most apps don't have this.

5. **The structured output via tool-use is clean.** No text parsing, reliable structured data. This is a solid technical foundation.

---

## Gaps (Biggest Opportunities)

### High Impact, Moderate Effort

1. **Gamification (streaks + daily goals)** — The `user_settings` table already has `current_streak`, `longest_streak`, `daily_goal_minutes`, `last_practice_date` columns. The schema is ready; just needs UI + streak logic. Research says streaks are the #1 driver of daily habit formation.

2. **HSK vocabulary pre-loading** — Import HSK 1-3 word lists into the `vocabulary` table. This lets the system track "you know 47% of HSK 2" and show meaningful progress bars. The import infrastructure (`importWords`) already exists.

3. **Tone-specific tracking** — Azure provides per-word accuracy but the app doesn't break down which tones are weakest. Adding tone analysis (from pinyin) to the dashboard would address the #1 cited difficulty in Mandarin learning.

### Medium Impact, Lower Effort

4. **Progressive pinyin fading** — Auto-hide pinyin for words the user has marked "known" (times_correct >= 3). Research recommends gradually removing scaffolding.

5. **Estimated HSK level on dashboard** — The session summary already computes `estimated_hsk_level`. Surface this prominently. Tangible progress visibility is a strong motivator.

6. **Session timer with gentle nudge** — Research says 15-30 min is optimal. Add a subtle indicator and suggestion to wrap up after 20 min.

### Lower Priority (P2 features)

7. **Character stroke order** — Would require an external dataset (Hanzi Writer library). Nice-to-have for a conversation-focused tool.

8. **Graded reading mode** — Short texts at HSK level with integrated dictionary. Significant new feature.

9. **Full shadowing mode** — Simultaneous listen-and-repeat with waveform comparison. The table exists, needs UI.

---

## Bottom Line

The app covers **all 6 P0 features** and **3 of 6 P1 features** from the research's ideal tool checklist. The conversation + correction + SRS core is exactly what the evidence says produces results. The biggest gaps are motivational (gamification, progress visibility) and Mandarin-specific depth (tones, characters, HSK mapping).

For a single-user personal tool, this is genuinely effective for learning. The main risk isn't feature gaps — it's consistency of use. That's why gamification (streaks, goals, progress bars) would be the highest-ROI next investment.
