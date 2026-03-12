# Bugs To Fix — COMPLETED (2026-03-10, commit 409c9a5)

## 1. Inconsistent pinyin/english on AI responses
**Symptom:** Some AI bubbles show full word-by-word breakdown (pinyin above characters, clickable words) while others show plain text with no pinyin or interactivity.

**Root cause:** Claude sometimes omits the `words` array from its tool response, or returns it empty. When `words` is missing/empty, ChatBubble falls back to rendering `aiResponse.response` as plain text.

**Fix options:**
- A) Add stricter validation in the API layer — if `words` is missing/empty, reject and retry
- B) Client-side fallback: if `words` is empty but `response` and `pinyin` exist, display response with pinyin as a single block (not ideal but better than nothing)
- C) Strengthen the system prompt to emphasize words array is mandatory and must cover the full response
- D) Combination: strengthen prompt (C) + client fallback (B) as safety net

**Priority:** High — this breaks the core learning UX

**Status:** FIXED — Strengthened Claude prompt with CRITICAL instruction + added `<ruby>` fallback in ChatBubble when words array is missing. Skipped server-side retry (not worth the complexity for a personal app).

## 2. Audio detection drops recognized speech
**Symptom:** User holds mic button, sees characters appear (interim text from Azure), but when releasing the button gets "No speech detected." The interim text disappears and nothing is sent.

**Root cause candidates:**
- Azure's `stopContinuousRecognitionAsync` fires its callback before the final `recognized` event arrives. The accumulated text in `accumulatedRef.current.text` is still empty because the last segment was only in `recognizing` (interim) state, not yet finalized.
- Pronunciation assessment mode may delay the `recognized` event while computing scores. If stop is called during this window, the segment is lost.
- The 3000ms segmentation timeout creates segment boundaries. If the user releases the button during the gap between segments, the in-progress segment may not finalize.

**Fix options:**
- A) On stop, wait a brief delay (e.g. 500ms) before calling `stopContinuousRecognitionAsync` to let the final segment finalize
- B) Capture interim text as fallback: if `accumulatedRef.current.text` is empty after stop but interim text was showing, use the interim text (without pronunciation scores)
- C) Both A and B together — delay first, fallback second

**Priority:** High — this makes the app frustrating to use

**Status:** FIXED — Rewrote stopListening with three-path logic: Path A (immediate harvest when recognized already fired), Path B (800ms wait for pronunciation scoring + interim text fallback), Path C (no speech). Added stoppingRef to prevent double-stop on iOS.

## 3. User pinyin/english inconsistent on user bubbles
**Symptom:** Some user bubbles show pinyin + english translation, others don't.

**Root cause:** Same as #1 — Claude sometimes omits `user_words`, `user_pinyin`, or `user_english` from the response. The user bubble only shows these when the AI response arrives (they come from Claude, not Azure).

**Fix:** Coupled with fix #1 — strengthen prompt + add fallback display

**Priority:** Medium — tied to #1

**Status:** FIXED — same fix as #1

## 4. AI response sometimes missing word breakdown entirely
**Symptom:** Last AI bubble in screenshot shows "好的，明白了！那你们要牛肉火锅吗？要几份？" as plain text — no pinyin, no clickable words.

**Root cause:** Same as #1 — `words` array was empty or missing in that response.

**Fix:** Same as #1

**Priority:** High — same as #1

**Status:** FIXED — same fix as #1
