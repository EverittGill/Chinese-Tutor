# Teacher Mode — Design & Research Brainstorm

## The Problem with Current Modes

**Normal mode** (小林): Great for conversation practice, but 小林 is a *conversation partner*, not a teacher. She corrects errors when they change meaning, but doesn't actively teach grammar patterns, explain why something works the way it does, or push the learner to stretch. The corrections are brief and tactical — they don't build understanding.

**Review mode**: Only uses known vocabulary. Good for reinforcement, zero growth.

**The gap**: Neither mode says "Here's a grammar pattern you should know at your level — let me show you how it works in conversation." Neither mode detects your actual level from what you produce and calibrates accordingly. Neither mode gives you the feeling of having a patient teacher who understands where you are and where you need to go.

## Research Foundations

### i+1 Calibration (Krashen, refined)
The research is clear: conversations should be "mostly comprehensible with targeted new material." But how does the teacher know what "+1" means for *this specific learner*?

**Solution**: `formatLevelContext()` computes an HSK level distribution from the learner's known vocabulary. If they know 80% HSK 1 and 20% HSK 2 words, their effective level is ~HSK 1.5. The teacher targets HSK 2 patterns and vocabulary — that's the "+1". As they master HSK 2 words, the distribution shifts and the target moves to HSK 3.

This is more nuanced than a single "level" number — the teacher sees the *distribution* and can identify gaps (e.g., "knows HSK 3 vocabulary but still makes HSK 1 grammar mistakes with measure words").

### Immediate Corrective Feedback (< 1 minute window)
The research says corrections must happen inline during conversation, not after. The cognitive window for effective pedagogical intervention is under 1 minute.

**Teacher mode approach**: The recast method.
1. Learner says something with an error
2. Teacher's Chinese `response` naturally recasts the correct form (modeling)
3. `teaching_notes` (English) explains *why* — the grammar rule, the pattern, when to use it
4. Conversation continues

This is different from normal mode's correction panel (which you have to tap to see). Teaching notes are *always visible* below the Chinese response — you can't miss them.

### Grammar as a Tool, Not a Goal
The research warns against both extremes: pure grammar drills (ineffective for communication) and pure immersion without grammar guidance (slow and frustrating for adults). The optimal approach: "introduce grammar points when they naturally arise in conversation."

**Teacher mode approach**: 王老师 (Wáng Lǎoshī) doesn't lecture about grammar in the abstract. Instead:
- When the learner uses 了 incorrectly → explain aspect markers
- When the learner puts a time word in the wrong position → explain time-before-verb rule
- When the learner uses 个 for everything → introduce the right measure word and explain the system
- When the learner makes a new error for the first time → more detailed explanation
- When repeating a known error pattern → briefer reminder, reference to the pattern

### Mandarin-Specific Grammar Patterns to Teach
From the research, these are the structural differences that trip up English speakers:

1. **Time expressions before verb**: 我明天去 (not *我去明天)
2. **Location before verb**: 我在家吃饭 (not *我吃饭在家)
3. **Measure words/classifiers**: 两个苹果, 一本书, 三只猫 — always Number + MW + Noun
4. **Aspect markers (了/过/着)**: These replace English tense. 了 = completed action, 过 = past experience, 着 = ongoing state
5. **Topic-comment structure**: 这本书我看过了 = "This book, I've read it"
6. **把 construction**: Moving the object before the verb for emphasis on result
7. **被 passive**: Less common than English passive but important
8. **Complement structures**: 得 complements for degree/result
9. **Serial verb constructions**: 我去商店买东西
10. **Question formation**: No word order change, just add 吗 or use question words in-situ

### Recast Approach (Error Correction Research)
The recommended correction approach from the research:
1. **Recast**: Repeat with correction naturally
2. **Highlight**: Mark the corrected element
3. **Explain briefly**: One-line grammatical explanation
4. **Continue**: Don't belabor — keep the conversation moving

Teacher mode implements this across two fields:
- `response` (Chinese): The recast — natural Chinese that models the correct form
- `teaching_notes` (English): The highlight + explanation — pointing out what changed and why

### Adaptive Difficulty via Mistake Pattern Tracking
The system already tracks `mistake_patterns` in the database (type, description, original, corrected). Teacher mode loads more of these (10 instead of 5) and passes them as level context. This lets the teacher:
- Identify recurring weakness areas
- Create practice opportunities for those specific patterns
- Increase difficulty when error rates drop
- Notice when a pattern is finally mastered and move on

## Design Decisions

### Why `teaching_notes` as a separate field (not in `response`)
TTS speaks the `response` field, configured for zh-CN voice. If English appears in `response`, the Chinese TTS voice will attempt to speak English — it sounds terrible and breaks the flow. By putting ALL English content in `teaching_notes`, we keep TTS clean while still having rich inline teaching.

### Why 王老师 (Wáng Lǎoshī), not 小林
小林 is a peer — a conversation partner at roughly your level. 王 (Wáng) is the most common Chinese surname, and 老师 (lǎoshī) means teacher. The name signals a different relationship: this is someone who *knows more than you* and is *actively helping you learn*. The avatar switches from 林 to 王 to reinforce this visually.

### Why max 2 new vocabulary (vs normal mode's 1)
Teacher mode is explicitly growth-focused. The learner chose this mode because they want to be pushed. The research supports slightly higher new vocabulary introduction when combined with immediate context and explanation — which teacher mode provides via teaching_notes. Still capped at 2 to avoid overwhelming.

### Why amber/orange styling
Visual distinction matters for mode awareness. Normal mode uses the default slate palette. Review mode uses teal. Teacher mode uses amber/orange — warm, authoritative, associated with learning and attention. The teaching notes also render in amber to create a consistent "teacher voice" visual language.

### Level Detection Strategy
Rather than asking the user "what's your HSK level?", the teacher infers it from:
1. **Vocabulary distribution**: HSK level of known words (computed by `formatLevelContext`)
2. **Production analysis**: What the learner actually produces in conversation (Claude observes this)
3. **Error patterns**: Types of mistakes reveal structural gaps
4. **Comprehension signals**: If the learner understands the teacher's i+1 responses

This is more accurate than self-assessment and adapts in real-time.

## What Success Looks Like

After 5-10 exchanges with 王老师:
- The learner has received 2-3 grammar explanations they didn't know before
- Each explanation is tied to something they actually said (or tried to say)
- They've been pushed to use a grammar pattern in their next response
- Their mistake patterns are being actively addressed
- They feel like they're being *taught*, not just *corrected*
- TTS works perfectly — only Chinese is spoken
- Teaching notes are visible but not overwhelming (1-3 sentences each)

## Technical Flow

```
User speaks → STT → recognized text
  → useConversation sends to /api/chat with teacher system prompt + level context
  → Claude (王老师) responds:
    - response: Chinese at i+1 level with natural recast of errors
    - teaching_notes: English explanation of grammar, encouragement, level observations
    - corrections: Structured correction data (same as normal mode)
    - new_vocabulary: Up to 2 new words
  → TTS speaks response (Chinese only)
  → ChatBubble renders:
    - Chinese response with word breakdown
    - teaching_notes in amber below
    - Corrections panel available on tap
```
