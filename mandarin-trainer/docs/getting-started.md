# Getting Started

## Prerequisites

- Node.js 18+
- Azure Speech Services account (for STT with pronunciation scoring + TTS)
- Anthropic API key (for Claude conversation AI)
- Supabase project (for persistence; app falls back to localStorage without it)

## Environment Setup

Create `mandarin-trainer/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
AZURE_SPEECH_KEY=your-azure-key
AZURE_SPEECH_REGION=eastus
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Database Setup

1. Open the Supabase Dashboard for your project
2. Go to SQL Editor → New Query
3. Paste the contents of `database/schema.sql`
4. Run the query

See `database/SCHEMA.md` for the full schema documentation.

## Running Locally

```bash
cd mandarin-trainer
npm install
npm run dev
```

This starts two processes:
- **Vite** dev server on port 3000 (frontend)
- **Express** proxy server on port 3001 (API routes for Claude + Azure token)

Open http://localhost:3000 in your browser.

## App Screens

| Screen | Access | Purpose |
|--------|--------|---------|
| Topic Selector | Home screen | Choose conversation topic or navigate to other screens |
| Conversation | Tap any topic | Practice speaking Mandarin with AI |
| Flashcard Review | "Review" button | FSRS-based spaced repetition flashcards |
| Vocabulary | "Vocab" button | Import/manage vocabulary lists |
| Dashboard | "Progress" button | View session history and pronunciation trends |

## How Conversation Works

1. Choose a topic (or "Open Conversation")
2. Hold the mic button and speak in Chinese
3. Azure STT transcribes your speech with pronunciation scoring
4. Claude responds in character, providing corrections and new vocabulary
5. Azure TTS speaks the response aloud
6. Your words are colored by pronunciation accuracy (green/yellow/red)
7. Tap "Finish" to end the session and see a summary

## How Flashcard Review Works

1. Words encountered in conversations are automatically added to your vocabulary
2. Each word gets FSRS scheduling parameters (difficulty, stability, due date)
3. Tap "Review" on the home screen to see cards due for review
4. Tap a card to reveal the answer, then rate: Again / Hard / Good / Easy
5. FSRS calculates the next review date based on your rating
