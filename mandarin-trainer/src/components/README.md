# Components Directory

All React UI components. Mobile-first design targeting iPhone 13 Pro Max. Warm/light theme (warm-50 bg, brand-600 accents).

## Screen Navigation

```
AuthScreen (no user)
  -> PromoCodeScreen (0 credits)
    -> TopicSelector (home)
        -> ConversationScreen
        -> FlashcardScreen
        -> VocabScreen (VocabImport + VocabList)
        -> Dashboard
        -> SettingsScreen
        -> PronunciationScreen
```

## Auth & Onboarding

| Component | Purpose |
|-----------|---------|
| `AuthScreen.jsx` | Login/signup with email + password. Shows "check your email" after signup (confirmation required). Uses `useAuth()`. |
| `PromoCodeScreen.jsx` | Promo code entry for new users with 0 credits. Calls `supabase.rpc('redeem_promo_code')`. Shown between auth and main app. |
| `SetupScreen.jsx` | First-time onboarding splash. Calls `markSetupComplete()` on tap. |

## Core Screens

| Component | Purpose |
|-----------|---------|
| `TopicSelector.jsx` | Home screen. Lists conversation topics (open, review, teacher, restaurant, shopping, etc.). Shows credit balance in header. |
| `ConversationScreen.jsx` | Main conversation UI. Integrates Azure STT/TTS, Claude chat, vocabulary context, session persistence. Controls for display mode, corrections, session summary. |
| `FlashcardScreen.jsx` | FSRS spaced repetition review. Two-queue architecture (review + learning). Production mode (speak) and recognition mode (tap to reveal). 4-second undo toast. |
| `PronunciationScreen.jsx` | Dedicated pronunciation practice. Shows sentence, records speech, displays Azure per-word/per-character scoring. |
| `Dashboard.jsx` | Analytics: pronunciation trend chart (SVG), recent sessions, mistake patterns, vocabulary stats, streak tracking. |
| `SettingsScreen.jsx` | User preferences: name, context, TTS voice (12 Azure voices), pinyin display mode. Account section: email, credits, promo code redemption, sign out. |

## Conversation Sub-Components

| Component | Purpose |
|-----------|---------|
| `ChatBubble.jsx` | Message bubbles with pronunciation coloring. Green (>=80%), yellow (60-79%), red (<60%). Pinyin popovers on word tap. Contains `PronunciationWord` and `ScoreBadge` sub-components. |
| `ClickableWord.jsx` | Interactive word with pronunciation color coding + popover (pinyin, English). Supports multiple display modes. |
| `CorrectionPanel.jsx` | Shows grammar/vocab/pronunciation corrections and new vocabulary from Claude's response. |
| `SessionSummary.jsx` | AI-generated session recap via Claude (Haiku). Displays summary with TTS playback. |

## Vocabulary

| Component | Purpose |
|-----------|---------|
| `VocabScreen.jsx` | Container for vocabulary features. Composes `VocabImport` + `VocabList`. |
| `VocabImport.jsx` | Import vocabulary from CSV/text via Claude tool-use (`convert_vocabulary` tool). Validates pinyin, converts to Chinese. |
| `VocabList.jsx` | Tabbed word list (Known, Learning, New). Toggle status per word, audio playback. |
