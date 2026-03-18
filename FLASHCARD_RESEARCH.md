# Optimal Flashcard Design: Research-Backed Principles for Language Learning

A reference document synthesizing findings from cognitive science, spaced repetition research, and established SRS programs (SuperMemo, Anki/FSRS) — focused on maximizing real retention for Mandarin learning.

---

## 1. The Forgetting Curve & Why Timing Matters

Hermann Ebbinghaus (1885) discovered that memory decays exponentially after learning. Without review, ~56% of new information is forgotten within one hour, ~66% within one day, and ~75% within six days. However, each well-timed review "resets" the curve at a higher baseline — the interval before you forget again grows longer each time.

**Key insight**: The optimal moment to review is just before you would forget — the point of maximum "desirable difficulty." Reviewing too early wastes time (you still know it). Reviewing too late means relearning from near-scratch.

### Forgetting Index Sweet Spot

Piotr Wozniak's SuperMemo research found:
- **Forgetting index of 10%** (= 90% recall at review time) is the standard practical target
- **Forgetting index of 20–30%** produces the greatest *knowledge acquisition rate* (items learned per unit time), but at the cost of more frequent lapses
- Below **5% forgetting index**, workload increases rapidly with diminishing returns
- Removing the **hardest 10% of items** (leeches) can increase learning speed by up to **300%**

**For our app**: Target ~85–90% desired retention. This is the consensus sweet spot for language learning — high enough for usable recall, low enough to avoid exponential review burden.

---

## 2. FSRS: The State of the Art Algorithm (What We Already Use)

Our app uses `ts-fsrs`, which implements the Free Spaced Repetition Scheduler. FSRS is built on the **Three Component Model of Memory**:

| Component | Definition | Role in Scheduling |
|-----------|-----------|-------------------|
| **Retrievability (R)** | Probability of successful recall right now | Determines when a card is "due" |
| **Stability (S)** | Days for R to decay from 100% → 90% | The core "interval" metric — higher = longer between reviews |
| **Difficulty (D)** | Intrinsic complexity of the item | Governs how fast stability grows after each review |

### How FSRS Calculates Intervals

An interval is "optimal" when it corresponds to the desired retention probability. If desired retention = 0.90, the algorithm finds the interval at which R = 0.90 for that card's current stability.

### FSRS vs SM-2 Performance

- FSRS achieves the **same retention with 20–30% fewer reviews** than SM-2
- FSRS-6 has **99.6% superiority** over SM-2 across benchmarked users
- FSRS handles lapses intelligently — instead of resetting to 1-day interval blindly, it calculates optimal relearning intervals based on the card's history

### Recommended FSRS Configuration

- **Desired retention**: 0.85–0.90 for language learning (0.90 is Anki's default; 0.85 is often recommended specifically for language vocabulary)
- **Don't manually adjust parameters** — let the algorithm optimize from review history
- **Wait for ~1,000 reviews** before optimizing parameters; default weights outperform premature optimization
- Higher retention (0.93+) is defensible for **high-frequency vocabulary** you'll use daily
- Lower retention (0.80–0.85) is fine for **passive recognition** vocabulary

---

## 3. The Testing Effect (Retrieval Practice)

The single most important principle in flashcard science.

### Karpicke & Roediger's Key Findings (2006–2007)

- Taking a memory test **enhances later retention** far more than re-studying the material
- On immediate tests, repeated studying beats repeated testing — but on **delayed tests (days/weeks), testing produces substantially greater retention**
- Increasing free recall sessions from 1 to 3 led to **substantial increases** on final tests given **1–4 months later**
- The effect is so robust it's been replicated hundreds of times across domains

### Production > Recognition

- Tests requiring **production** (short-answer, free recall) produce greater retention benefits than **recognition** tests (multiple choice)
- For language: being asked to *produce* 你好 from "hello" is harder but more effective than recognizing 你好 among options

**For our app**: Always require active production. Show English/pinyin → require the Chinese. This is harder but produces dramatically better learning than showing Chinese → asking for English.

---

## 4. Card Design: The Minimum Information Principle

From Wozniak's "20 Rules of Formulating Knowledge" — the most cited guide on flashcard creation:

### Core Rules for Language Cards

1. **Minimum information**: One fact per card. Don't ask "What are the tones, pinyin, meaning, and measure word for 苹果?" — make separate cards for each.

2. **Cloze deletion for sentences**: "我想去___买东西" (商店) is more effective than "What is the Chinese word for store?" because it tests the word *in grammatical context*.

3. **Combat interference**: Similar-sounding or similar-meaning words (e.g., 买/卖, 哪/那) need explicit distinguishing context on the card. Add example sentences that highlight the difference.

4. **Personalize**: "The restaurant where I ordered 红烧肉 last Tuesday" is more memorable than a generic definition. Personal context creates durable memory traces.

5. **Use imagery**: Visual associations dramatically outperform text-only cards. For character learning, even a crude visual mnemonic for radicals helps.

6. **Avoid sets/enumerations**: Don't make a card "List the 4 tones of Mandarin." Instead, test each tone in the context of a specific word.

7. **Redundancy is OK**: Testing the same knowledge from multiple angles (English→Chinese, Chinese→English, audio→characters, cloze sentence) doesn't violate minimum information — it strengthens different retrieval pathways.

---

## 5. Bidirectional Testing & Card Types

Research shows language learners need both **receptive** (recognition) and **productive** (production) abilities:

| Card Type | Front | Back | Tests |
|-----------|-------|------|-------|
| **Recognition** | 苹果 (píngguo) | apple | Reading comprehension |
| **Production** | apple | 苹果 (píngguo) | Active recall / speaking |
| **Cloze** | 我想买两个___ | 苹果 | Contextual usage |
| **Audio** | 🔊 [audio] | 苹果 / apple | Listening comprehension |
| **Tone** | píng guǒ → which tones? | 2nd, 3rd | Tonal accuracy |

### Which Matters Most for Conversation?

**Production cards** (English → Chinese) are harder but directly train the skill needed for speaking. Students using retrieval practice retain **80–90% more vocabulary** than those using passive recognition.

**For our app**: Prioritize production cards (English → Chinese) as the primary card type. Recognition (Chinese → English) can use shorter intervals / lower priority since it's easier. Cloze sentences from actual conversation context are the highest-value card type.

---

## 6. The Production Effect: Say It Aloud

MacLeod et al. (2010) demonstrated the **production effect**: words read aloud during study are remembered **10–20% better** than words read silently, across multiple studies.

The effect works through **distinctiveness** — producing a word creates an additional motor/auditory memory trace alongside the visual one. It also applies to:
- Whispering
- Mouthing
- Typing the word

**For our app**: Prompt the user to speak the answer aloud before revealing it. This is especially powerful for Mandarin where tonal production is a distinct skill. Our pronunciation scoring integration already supports this — we should make "speak the answer" the default flashcard interaction mode.

---

## 7. Desirable Difficulties

Bjork's "desirable difficulties" framework: conditions that make learning *harder* during practice but *better* for long-term retention.

### Applied to Flashcards

| Difficulty | How to Apply | Why It Works |
|-----------|-------------|-------------|
| **Spacing** | Longer gaps between reviews | Forces deeper retrieval; builds stability |
| **Interleaving** | Mix vocabulary topics, grammar points, HSK levels | Improves discrimination and transfer |
| **Retrieval** | Test before revealing answer | Strengthens memory trace even if you fail |
| **Variation** | Show the same word in different sentence contexts | Builds flexible, context-independent knowledge |
| **Generation** | Ask learner to construct, not just recognize | Deeper processing = stronger encoding |

### Interleaving for Language Learning

- Mixing vocabulary topics produces **better long-term retention** than studying one topic at a time
- The benefit *increases* over time — interleaving advantage grows with delay
- Important caveat: learners need **some familiarity** before interleaving is effective. Brand-new items should get initial blocked practice before being mixed in.

**For our app**: Don't group flashcards by topic/conversation. Shuffle all due cards together. But for cards in their first 1–2 reviews, allow brief initial clustering before mixing into the general pool.

---

## 8. Lapse Handling: When the Learner Forgets

What happens when a card is answered incorrectly is critical to the system's effectiveness.

### Research-Backed Lapse Strategy

1. **Don't reset to zero**: FSRS already handles this — it calculates a new stability based on the card's history rather than blindly resetting the interval to 1 day.

2. **Relearning phase**: After a lapse, the card enters relearning steps (short fixed intervals) before returning to the spaced schedule. Typical: 10 min → 1 day → resume algorithm.

3. **Leech detection**: If a card is lapsed 6+ times, it's a **leech** — likely poorly formulated. The correct response is to **rewrite the card**, not to show it more often. Options:
   - Add a mnemonic or image
   - Break it into simpler sub-cards
   - Add a distinguishing context sentence
   - Suspend and revisit after more immersion

4. **Difficulty threshold**: If a card's effective ease drops below ~130%, the item is too hard for pure SRS and needs reformulation. Showing it more frequently leads to frustration with minimal memory benefit.

**For our app**: Track lapse count. After 5+ lapses on a card, flag it as a leech and suggest the user add a mnemonic, or automatically generate a new context sentence from Claude to make it more memorable.

---

## 9. Optimal New Card Introduction Rate

Research and practical experience from mature SRS programs:

- **5% of total study time** goes to new material; **95% is review** (Wozniak)
- With a 10% forgetting index and ~1 minute of daily practice per card, a learner acquires approximately **200–300 items annually**
- Cards with short intervals (1–60 days) comprise just 5% of the collection but consume **63% of daily workload**

### Practical Guidelines

| Daily Study Time | Recommended New Cards/Day | Rationale |
|-----------------|--------------------------|-----------|
| 10 minutes | 3–5 | Manageable review load; sustainable |
| 20 minutes | 5–10 | Good pace for serious learners |
| 30+ minutes | 10–20 | Aggressive; risk of review pile-up |

**For our app**: Default to 5 new cards/day. Allow the user to adjust. Show a projected review workload: "Adding 10 new cards/day will mean ~80 reviews/day in 3 months." Prevent review pile-up by pausing new cards when the review backlog exceeds a threshold (e.g., 2x the normal daily reviews).

---

## 10. Mandarin-Specific Considerations

### Character-Sound-Meaning Triangle

Mandarin vocabulary involves three linked but distinct memory tasks:
1. **Character → Sound** (reading aloud): 苹果 → píngguo
2. **Sound → Meaning** (listening comprehension): píngguo → apple
3. **Meaning → Sound** (production for speaking): apple → píngguo
4. **Character recognition** (reading comprehension): 苹果 → apple

These should be treated as **separate memory items** with independent scheduling, since they have different difficulty levels and different retrieval pathways.

### Tones Are a Separate Skill

Tonal accuracy is a motor/auditory skill that doesn't automatically transfer from knowing the pinyin. The pronunciation scoring data we get from Azure can drive a separate "tone card" type that specifically targets words where the user's tone accuracy is below threshold.

### Context Sentences Are Essential

For Chinese especially, the same character can have wildly different meanings in different contexts (e.g., 打 in 打电话, 打球, 打车). Always attach at least one context sentence from the actual conversation where the word appeared.

---

## 11. Summary: Design Principles for Maximum Effectiveness

### Scheduling
- [x] Use FSRS (we already do via `ts-fsrs`)
- [ ] Set desired retention to **0.85** for vocabulary, **0.90** for high-frequency items
- [ ] Wait for 1,000+ reviews before optimizing FSRS parameters
- [ ] Default 5 new cards/day with adjustable limit
- [ ] Pause new cards when review backlog > 2x daily normal

### Card Design
- [ ] One fact per card (minimum information principle)
- [ ] Include context sentence from the conversation where the word appeared
- [ ] Support cloze deletion cards using conversation sentences
- [ ] Create separate cards for production (EN→ZH) and recognition (ZH→EN)
- [ ] Flag leeches (5+ lapses) and suggest reformulation

### Interaction
- [ ] Default mode: speak the answer aloud (production effect + pronunciation practice)
- [ ] Use pronunciation scoring on flashcard answers, not just conversation
- [ ] Interleave cards from different topics/conversations
- [ ] Brief initial clustering for brand-new cards before mixing

### Feedback
- [ ] Show only the answer after the user attempts recall (not before)
- [ ] Use 4-point rating scale (Again / Hard / Good / Easy) — maps directly to FSRS ratings
- [ ] Track and display retention rate so the user can see their actual performance

---

## Sources

### Foundational Research
- [Ebbinghaus Forgetting Curve — Wikipedia](https://en.wikipedia.org/wiki/Forgetting_curve)
- [Karpicke & Roediger (2006) — Test-Enhanced Learning](https://pubmed.ncbi.nlm.nih.gov/16507066/)
- [Karpicke & Roediger (2007) — Repeated Retrieval During Learning](https://learninglab.psych.purdue.edu/downloads/2007/2007_Karpicke_Roediger_JML.pdf)
- [Roediger & Karpicke (2006) — The Power of Testing Memory](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x)
- [MacLeod et al. (2010) — The Production Effect: Delineation of a Phenomenon](https://uwaterloo.ca/memory-attention-cognition-lab/sites/default/files/uploads/files/jep10.pdf)

### Spaced Repetition Algorithms
- [FSRS ABC — open-spaced-repetition/fsrs4anki Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs)
- [FSRS Optimal Retention — open-spaced-repetition/fsrs4anki Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-optimal-retention)
- [FSRS vs SM-2 Guide (2025) — MemoForge](https://memoforge.app/blog/fsrs-vs-sm2-anki-algorithm-guide-2025/)
- [Wozniak — Theoretical Aspects of Spaced Repetition (SuperMemo)](https://www.supermemo.com/en/blog/theoretical-aspects-of-spaced-repetition-in-learning)
- [Wozniak — Optimization of Repetition Spacing in the Practice of Learning](https://www.researchgate.net/publication/15174960_Optimization_of_repetition_spacing_in_the_practice_of_learning)

### Card Design & Formulation
- [Wozniak — 20 Rules of Formulating Knowledge (SuperMemo)](https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge)
- [Minimum Information Principle — supermemo.guru](https://supermemo.guru/wiki/Minimum_information_principle)

### Language Learning Specifics
- [Desirable Difficulties in Relearning Retrievals for Foreign Language Vocabulary](https://www.researchgate.net/publication/391879474_Desirable_difficulties_in_relearning_retrievals_for_foreign_language_vocabulary)
- [Interleaving Effects on L2 Vocabulary Learning (Libersky et al., 2025)](https://journals.sagepub.com/doi/10.1177/02676583251338768)
- [Scientific American — The Interleaving Effect](https://www.scientificamerican.com/article/the-interleaving-effect-mixing-it-up-boosts-learning/)
- [Anki Retention Rates for Language Fluency — SPEAKADA](https://speakada.com/anki-retention-rates-explained-why-90-95-beats-the-standard-80-for-language-fluency/)
- [Best Anki Settings for Language Learning (2026) — Migaku](https://migaku.com/blog/language-fun/anki-settings-for-language-learning)
- [Cloze Deletion Language Learning Guide — Migaku](https://migaku.com/blog/language-fun/cloze-deletion-language-learning-guide)

### Algorithm Implementation
- [Implementing FSRS in 100 Lines — Borretti](https://borretti.me/article/implementing-fsrs-in-100-lines)
- [FSRS Has Gotten Way Better — Domenic Denicola](https://domenic.me/fsrs/)
- [Spaced Repetition Algorithm: Novice to Expert — fsrs4anki Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/spaced-repetition-algorithm:-a-three%E2%80%90day-journey-from-novice-to-expert)
