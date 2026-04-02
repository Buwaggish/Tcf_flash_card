# TCF Canada Flashcards

A React + Vite study app for TCF Canada preparation.

This project currently combines:

- flashcard study with spaced repetition
- category and unit organization
- JSON flashcard import
- long-article reading with sentence-by-sentence playback
- long-article sequential flashcards for structured speaking practice
- optional cloud sync with Supabase
- optional AI explanation and TTS helpers

## Current Features

- Study cards by category or unit
- Study all due cards across the app
- SRS scheduling with `again / hard / good / easy`
- Manual card edit and delete
- Card audio with browser TTS, Azure TTS, or a local proxy service
- AI explanation for a card using Google Gemini
- Long article library with create, edit, delete, and sentence splitting
- Long article playback sentence by sentence with previous/next controls
- Sequential flashcard mode generated from long articles without breaking sentence order
- Local persistence with `localStorage`
- Daily study timer, streak tracking, and browser notifications
- Optional Supabase sync for cards, long articles, and study logs

## Tech Stack

- React 19
- TypeScript
- Vite
- Supabase
- Google Gemini API
- Azure Speech API

## Run Locally

Prerequisites:

- Node.js 20+ recommended

Install and start:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Configuration

No `.env` file is required for the current app flow.

Most optional credentials are entered inside the UI and stored in `localStorage`:

- Supabase project URL and anon key
- Azure Speech region and key
- Google Gemini API key

Optional local speech service endpoints expected by the app:

- `http://localhost:1000/speak`

## Data Model

The app currently stores:

- Categories
- Units
- Flashcards
- Long articles
- Daily study logs

Flashcards use this shape:

```ts
{
  id: string;
  front: string;
  back: string;
  mastered: boolean;
  srs?: {
    interval: number;
    repetition: number;
    easeFactor: number;
    dueDate: number;
  };
}
```

Long articles use this shape:

```ts
{
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}
```

## Import Format

Flashcard import expects a JSON array like this:

```json
[
  {
    "category": "Expression Orale",
    "unit": "Unit 1: Salutations",
    "front": "Good morning (Formal)",
    "back": "Bonjour madame"
  },
  {
    "category": "Expression Orale",
    "unit": "Unit 1: Salutations",
    "front": "How are you?",
    "back": "Comment allez-vous aujourd'hui"
  }
]
```

## Supabase Tables

If you enable cloud sync, the app expects these tables:

- `tcf_categories`
- `tcf_units`
- `tcf_cards`
- `tcf_sync_meta`
- `study_logs`
- `tcf_long_articles`

The table creation SQL is also shown in the in-app sync modal.

## Project Notes

- Flashcards and long articles are both saved locally first
- Long articles are already split into sentences at runtime for playback
- Cloud sync merges card data and can also persist long articles
- The current long-article mode is better for sequential reading than the flashcard mode
