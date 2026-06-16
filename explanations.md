# Flashcard App Code Explanation

This project is a React + TypeScript study app for TCF Canada preparation. The fastest way to understand it is to read it in this order:

1. `types.ts`
2. `services/srsService.ts`
3. `App.tsx`
4. `components/FlashcardView.tsx`
5. `services/syncService.ts`
6. speech/AI services: `ttsService.ts`, `azureService.ts`, `geminiService.ts`

## Mental Model

The app is local-first. Cards, long articles, study settings, API keys, and timer data are mainly stored in browser `localStorage`. Supabase is optional: when configured, the app can push/pull card data, long articles, and study logs.

The data hierarchy is:

```text
Category
  -> Unit
      -> Flashcard
```

Long articles are separate from categories and units. When a long article is studied as flashcards, the app generates temporary sequence cards from article sentences.

## Core Data Types

File: `types.ts`

Important types:

- `SRSData`: review scheduling fields.
- `Flashcard`: front/back card data plus optional `srs`.
- `Unit`: a named group of cards.
- `Category`: a named group of units.
- `LongArticle`: stored article title/content/timestamps.
- `ViewState`: top-level screen routing enum.

The most important part is `Flashcard.srs`:

```ts
{
  interval: number;
  repetition: number;
  easeFactor: number;
  dueDate: number;
}
```

This lets every card carry its own scheduling state. The UI does not need a separate global schedule table.

## Spaced Repetition Logic

File: `services/srsService.ts`

This service owns the card review algorithm. The key function is:

```ts
calculateNextReview(currentSRS, grade)
```

The app supports four grades:

- `again`: reset repetition, review again in 5 minutes, reduce ease factor.
- `hard`: review again in 20 minutes, reduce ease factor slightly.
- `good`: schedule for 1 day if new, otherwise grow by `interval * easeFactor`.
- `easy`: schedule for 7 days if new, otherwise grow faster than `good`.

The helper `normalizeSrs` protects the app from old or malformed card data. If a card has no valid SRS object, the app treats it as new/due.

Other helpers:

- `isCardDue(card)`: returns true if card is new or due.
- `getCardPriority(card)`: sorts due cards before new cards before future cards.
- `getCardStatusLabel(card)`: returns UI labels like `New`, `Due`, `3h`, `4d`.

Interview note: call this "SM-2 inspired" or "spaced repetition inspired." The current code does not use the exact 0-5 SM-2 quality input.

## Main Application State

File: `App.tsx`

`App.tsx` is the top-level coordinator. It owns:

- category/unit/card data
- selected category and unit
- long articles
- modal open/close state
- Supabase sync status
- notification state
- study timer state

Important flows:

### Startup

On mount, the app reads:

- `tcf-cards-data` from `localStorage`
- `tcf-long-articles` from `localStorage`
- `tcf-supabase-config` from `localStorage`

If there is no card data, it creates default TCF categories:

- `Compréhension Orale`
- `Expression Orale`
- `Compréhension Écrite`
- `Expression Écrite`

### Persistence

Whenever `data` changes, it writes back to:

```text
localStorage["tcf-cards-data"]
```

Whenever `longArticles` changes, it writes back to:

```text
localStorage["tcf-long-articles"]
```

### Cloud Save Queue

The function `runCloudSave` prevents overlapping cloud writes.

It uses:

- `saveInFlightRef`: true while one push is running.
- `pendingSaveRef`: stores the latest data if another change happens mid-save.

This avoids firing multiple Supabase writes at the same time and losing the newest version.

## Flashcard Study View

File: `components/FlashcardView.tsx`

This component is the study screen. It handles:

- current card selection
- queue sorting
- flip state
- study mode vs gallery mode
- review buttons
- TTS playback
- Azure playback
- Gemini explanation
- cloze mode
- auto playback
- edit/delete card actions

Queue logic:

- In normal SRS mode, cards are sorted by `getCardPriority`.
- In article sequence mode, cards stay in sentence order.
- `excludedIds` lets the session skip cards without deleting them.

Important distinction:

- `cards`: all cards for the unit/article.
- `studyCards`: optional filtered/derived cards used for a specific session.
- `currentCard`: the card currently shown.

## Long Article Flow

Files:

- `services/articleService.ts`
- `services/textSegmentation.ts`
- `components/LongArticleView.tsx`
- `components/LongArticleModal.tsx`

Long articles are stored as full text. When the user studies an article, the app splits the content into sentences.

`buildArticleSequenceCards(article)` converts each sentence into a temporary flashcard:

- front: prompt asking for the next sentence
- back: actual sentence
- id: stable generated id based on article id and sentence number

This lets the normal flashcard UI reuse article content without permanently storing every sentence as a normal card.

## Sync Service

File: `services/syncService.ts`

This module converts local nested app data into Supabase table rows.

Tables used:

- `tcf_categories`
- `tcf_units`
- `tcf_cards`
- `tcf_long_articles`
- `tcf_sync_meta`
- `study_logs`

The important design is snapshot-based sync:

1. Generate a new `snapshotId`.
2. Write categories, units, and cards with that snapshot id.
3. Verify card count.
4. Update `tcf_sync_meta` to point to the new snapshot.
5. Delete older snapshots as cleanup.

If a write fails, the service deletes partial rows for that snapshot so the app does not later load incomplete data.

`consolidateData` deduplicates categories, units, and cards by normalized names/content. This is useful after importing or merging cloud/local data.

Production limitation: the browser talks directly to Supabase. For a real multi-user product, put a backend API in front of Supabase to own validation, authorization, and schema changes.

## Speech and AI Services

Files:

- `services/ttsService.ts`
- `services/azureService.ts`
- `services/geminiService.ts`

`ttsService.ts` uses browser Web Speech API:

- finds French voices
- deduplicates voices by name
- speaks text with selected voice
- can call a local proxy at `http://localhost:1000/speak`

`azureService.ts` uses Azure Speech:

- builds SSML
- calls Azure TTS endpoint
- receives an MP3 blob
- plays it through an `Audio` element
- cancels/revokes old playback before starting a new one

`geminiService.ts` uses Gemini:

- `generateCardContext`: short French explanation + example + Chinese translation.
- `generateSpeech`: Gemini TTS path returning an `AudioBuffer`.

## Suggestions

These are concrete improvements that fit the current architecture without adding unnecessary complexity.

### 1. Add cards from the UI

Right now `handleImport` in `App.tsx` only accepts JSON files. A simple inline form inside a unit (front + back text fields and a submit button) would make it much easier to add individual cards during a study session. The `handleImport` function already handles deduplication and cloud sync, so the new form just needs to call it with a single-item array.

### 2. localStorage key constants

String keys like `'tcf-cards-data'`, `'tcf-study-time'`, `'tcf-azure-key'`, etc. appear as literals in both `App.tsx` and `FlashcardView.tsx`. A small `constants/storageKeys.ts` file prevents silent typos and makes it easy to find all persisted keys in one place.

### 3. Session summary at end of review

When `sessionComplete` becomes true in `FlashcardView.tsx`, the screen only shows "You're all caught up." Since `handleRate` already knows every grade given, the component could accumulate counts (`again`, `hard`, `good`, `easy`) during the session and display a simple breakdown on the completion screen. No new data needs to be stored.

### 4. Unit rename

Units can be deleted (`handleDeleteUnit`) but not renamed. Adding an edit icon next to the delete button in the home unit list, with an inline input and the same cloud-save path as `handleUpdateCard`, would complete the CRUD surface for units.

### 5. Article metadata in the list

`splitIntoSentences` is already imported in `services/articleService.ts`. The long article list in `renderHome` could call it to show a sentence count (e.g. "24 sentences") next to each article title, giving a quick sense of difficulty before opening the sequence flashcards.

### 6. Keyboard shortcut help overlay

The study view has several shortcuts (Space/Enter to flip, P/O/I to play audio, Q–R or 1–4 to rate, arrow keys in sequence mode) but they are not discoverable. A small `?` button in the `FlashcardView` header that toggles a modal listing the shortcuts would help new users without changing any existing behavior.

### 7. Import validation feedback

`handleImport` silently skips duplicate cards. If the imported file contains 50 items but 30 already exist, the user sees nothing. Returning the count of skipped vs added items from the import handler and surfacing it as a brief toast or alert in `ImportModal` would make the import flow much clearer.
