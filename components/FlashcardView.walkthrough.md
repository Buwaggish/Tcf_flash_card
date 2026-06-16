# FlashcardView.tsx Walkthrough

This document explains `FlashcardView.tsx` for someone reading the code for the first time.

File:

```text
Flashcard-display/Tcf_flash_card/components/FlashcardView.tsx
```

## What This Component Does

`FlashcardView` is the main study screen. It is responsible for:

- showing one flashcard at a time
- flipping between question and answer
- sorting cards into a study queue
- applying spaced repetition ratings
- playing French audio through several backends
- showing AI explanations
- supporting cloze/fill-in-the-blank practice
- supporting article sequence mode
- supporting auto-preview mode
- editing, deleting, and snoozing cards
- showing a gallery/table view of all cards

It is a large component because it combines study UI, audio controls, keyboard shortcuts, and several special modes.

## Props

The component receives data and callbacks from `App.tsx`.

```ts
interface FlashcardViewProps {
  cards: Flashcard[];
  studyCards?: Flashcard[];
  title: string;
  onBack: () => void;
  unitId: string;
  onUpdateCard: (cardId: string, updates: Partial<Flashcard>) => void;
  onDeleteCard?: (cardId: string) => void;
  onStudyActivity?: () => void;
  todayStudyTime?: number;
  onResetTimer?: () => void;
  isTimerPaused?: boolean;
  isTimerExpanded?: boolean;
  onToggleTimerPause?: () => void;
  onToggleTimerExpanded?: () => void;
  autoPreview?: boolean;
  studyMode?: StudyMode;
}
```

Important props:

- `cards`: the full card list for this unit or generated article sequence.
- `studyCards`: optional filtered list used for a specific study session.
- `onUpdateCard`: writes card updates back to parent state.
- `onDeleteCard`: deletes a card from parent state.
- `autoPreview`: runs display/audio without recording progress.
- `studyMode`: either normal SRS mode or sequence mode.

## Main Modes

There are three important mode concepts.

### 1. View Mode

```ts
const [viewMode, setViewMode] = useState<'study' | 'gallery'>('study');
```

`study` shows one flippable card.

`gallery` shows all cards in a table with status, question, answer, audio, edit, and delete actions.

### 2. Study Mode

```ts
const isSequenceMode = studyMode === 'sequence';
```

Normal SRS mode:

- cards are sorted by due priority
- user rates cards with `again`, `hard`, `good`, or `easy`
- card SRS data is updated

Sequence mode:

- cards stay in fixed order
- used for long article sentence practice
- does not update SRS
- disables edit/delete/rating behavior

### 3. Auto Preview Mode

```ts
autoPreview?: boolean;
```

Auto preview:

- forces study view
- shows answer automatically
- plays Azure pronunciation
- advances after a timer
- does not record review progress
- disables normal rating controls

This is useful for passive review or auto pronunciation playback.

## Study Queue Initialization

The first important `useEffect` builds the study queue:

```ts
const queueCards = studyCards ?? cards;
const filtered = queueCards.filter(card => !excludedIds.has(card.id));
const sorted = isSequenceMode ? [...filtered] : [...filtered].sort(...);
```

In sequence mode, order is preserved.

In SRS mode, cards are sorted by:

1. due cards
2. new cards
3. future cards
4. earlier due date first

That sorting comes from:

```ts
getCardPriority(card)
```

The effect also keeps `currentCard` valid. If the old current card still exists in the queue, it keeps it. Otherwise, it switches to the first card.

## Important State Variables

### Queue and Session State

```ts
const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
const [sessionComplete, setSessionComplete] = useState(false);
const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
```

- `studyQueue`: cards currently available in the session.
- `sessionComplete`: true when the queue is empty or sequence reaches the end.
- `currentCard`: card currently shown.
- `excludedIds`: cards skipped from the current session after rating, snoozing, or deleting.

### Flip and Playback State

```ts
const [isFlipped, setIsFlipped] = useState(false);
const [isPlaying, setIsPlaying] = useState(false);
```

- `isFlipped`: controls front/back visual rotation.
- `isPlaying`: prevents overlapping audio playback.

### API Keys and Settings

```ts
const [azureRegion, setAzureRegion] = useState(() => localStorage.getItem('tcf-azure-region') || '');
const [azureKey, setAzureKey] = useState(() => localStorage.getItem('tcf-azure-key') || '');
const [googleKey, setGoogleKey] = useState(() => localStorage.getItem('tcf-google-key') || '');
```

These are loaded from `localStorage`, edited in the settings panel, and saved back to `localStorage`.

### AI and Cloze State

```ts
const [aiExplanation, setAiExplanation] = useState<string | null>(null);
const [isClozeMode, setIsClozeMode] = useState(false);
const [clozeInput, setClozeInput] = useState('');
const clozeIndexMapRef = useRef<Map<string, number>>(new Map());
```

- `aiExplanation`: stores the Gemini explanation for the current card.
- `isClozeMode`: toggles fill-in-the-blank display.
- `clozeInput`: user answer for the missing word.
- `clozeIndexMapRef`: remembers which word is hidden for each card.

## Audio System

The component supports several playback paths.

### Browser Local Voice

Function:

```ts
handlePlayAudio(text, event, cardId)
```

Uses:

```ts
speak(text, getSelectedVoice())
```

This uses the browser Web Speech API.

### Azure Cloud Voice

Function:

```ts
handleCloudPlay(text, event, cardId)
```

Uses:

```ts
playAzureTTS(text, azureRegion, azureKey)
```

If Azure settings are missing, the settings panel opens.

### Local Proxy Voice

Function:

```ts
handleLocalProxyPlay(text, event, cardId)
```

Uses:

```ts
speakViaLocalService(text)
```

This expects a local service at:

```text
http://localhost:1000/speak
```

### Word-by-word Slow Mode

Function:

```ts
handlePlaySequence(text, event, cardId)
```

This splits text by spaces and speaks each word with a short pause. It appears only when the answer is longer than four words.

## AI Explanation

Function:

```ts
handleAiExplain(e)
```

Flow:

1. Stop if no current card or already generating.
2. Require Google Gemini API key.
3. Choose a term:
   - short answer: use `currentCard.back`
   - long answer: combine `front + back`
4. Call `generateCardContext(term, googleKey)`.
5. Store the result in `aiExplanation`.

The explanation is shown at the top of the back side of the card.

## Rating Cards

Function:

```ts
handleRate(grade)
```

This only works in normal SRS mode. It does nothing in:

- `autoPreview`
- sequence mode

Flow:

1. Mark study activity with `onStudyActivity`.
2. Calculate new SRS data:

```ts
const newSRS = calculateNextReview(currentCard.srs, grade);
```

3. Decide whether to requeue the card.

```ts
const isRequeue = !studyCards && newSRS.interval === 0;
```

`again` and `hard` usually produce interval `0`, so those cards can be placed at the end of the queue for short-term review.

4. Call parent update:

```ts
onUpdateCard(currentCard.id, { srs: newSRS });
```

5. Remove or requeue the card locally.
6. Move to the next card or mark the session complete.

## Snooze and Delete

Snooze and delete use a shared confirmation state:

```ts
const [pendingConfirm, setPendingConfirm] = useState<{ type: 'snooze' | 'delete'; card: Flashcard } | null>(null);
```

### Snooze

`handleSnooze` opens confirmation.

`handleConfirmAction` creates an SRS object with:

- `dueDate`: now + 30 days
- `interval`: 30
- `repetition`: previous repetition + 1
- `easeFactor`: previous ease factor or 2.5

Then it updates the card and removes it from the current queue.

### Delete

Delete also opens confirmation. On confirm:

1. Add card id to `excludedIds`.
2. Call `onDeleteCard(cardId)`.
3. Remove the card from the local queue.

## Editing Cards

State:

```ts
const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
const [editFront, setEditFront] = useState('');
const [editBack, setEditBack] = useState('');
```

`handleEditOpen` copies the selected card into edit state.

`handleEditSave`:

1. trims `editFront` and `editBack`
2. calls `onUpdateCard`
3. updates `studyQueue`
4. updates `currentCard`
5. clears cloze and AI state
6. closes the modal

Editing is disabled in sequence mode because article sequence cards are generated temporary cards.

## Sequence Mode Navigation

Important functions:

```ts
moveSequenceToIndex(nextIndex)
handleSequencePrev()
handleSequenceNext()
handleSequenceRestart()
```

`moveSequenceToIndex` is the central function. It:

- cancels speech
- stops Azure audio
- resets flip state
- moves to a valid card index
- marks session complete if index is past the end

The sequence buttons are:

- Previous
- Restart
- Next / Finish

The next button is disabled until the card is flipped. This encourages the user to reveal/check the sentence before moving forward.

## Auto Preview Logic

The largest `useEffect` controls auto-preview mode.

It uses these refs:

```ts
const autoTimerRef = useRef<number | null>(null);
const autoSessionRef = useRef(0);
const autoRunActiveRef = useRef(false);
const autoTimeoutsRef = useRef<number[]>([]);
const autoStartedCardIdRef = useRef<string | null>(null);
```

Why refs instead of state:

- timers should not trigger re-renders
- async audio playback needs cancellation guards
- old timer callbacks must be invalidated when the card changes

Auto-preview flow:

1. If auto-preview is off, clear timers and stop active run.
2. If no card exists, do nothing.
3. If audio has not been manually started on Apple touch devices, show the answer but wait for user gesture.
4. Start an auto display session.
5. Flip the card.
6. Require Azure settings.
7. Play answer audio immediately.
8. Play again after 10 seconds if the interval is long enough.
9. Advance after `autoAdvanceSeconds`.
10. Use a watchdog interval and page resume events to handle Safari/iPad timer throttling.

Important implementation detail:

```ts
sessionId !== autoSessionRef.current
```

This check prevents old async callbacks from changing the UI after the current auto session has changed.

## Keyboard Shortcuts

The keyboard `useEffect` only runs in study view.

Shortcuts:

| Key | Action |
|---|---|
| Space / Enter | Flip card |
| P | Play browser local voice |
| O | Play Azure cloud voice |
| I | Play local proxy voice |
| Q or 1 | Rate Again |
| W or 2 | Rate Hard |
| E or 3 | Rate Good |
| R or 4 | Rate Easy |
| Left / B | Previous sequence card |
| Right / N | Next sequence card |

Keyboard input is ignored if the user is typing in an input, textarea, or select.

## Derived Values Before Render

Near the bottom, the component computes values used by JSX:

```ts
const isFrenchLong = currentCard ? currentCard.back.split(' ').length > 4 : false;
const isDue = currentCard ? isCardDue(currentCard) : false;
const queueBadgeLabel = isSequenceMode ? `${studyQueue.length} Steps` : `${studyQueue.length} Queue`;
const canEditCurrentCard = !isSequenceMode && !!currentCard;
```

It also precomputes the next due labels for the four rating buttons:

```ts
const nextAgain = currentCard ? calculateNextReview(currentCard.srs, 'again') : null;
const nextHard = currentCard ? calculateNextReview(currentCard.srs, 'hard') : null;
const nextGood = currentCard ? calculateNextReview(currentCard.srs, 'good') : null;
const nextEasy = currentCard ? calculateNextReview(currentCard.srs, 'easy') : null;
```

Those values are displayed under each rating button.

## Render Structure

The JSX has this structure:

```text
Fragment
  Main container
    Header row
      Back button
      Study timer
      Study/Gallery toggle
      Queue badge
      Cloze toggle
      Settings panel
    Auto-preview banner
    Sequence-mode banner
    Title
    Either:
      Gallery table
      OR Study card screen
        Session complete screen
        OR Flippable card
          Front side
          Back side
          Bottom controls
  ConfirmModal
  Edit card modal
```

## Gallery View

Gallery mode renders a table:

- status or sequence step
- question
- answer
- action buttons

Actions:

- edit card
- delete card
- play audio

In sequence mode, edit/delete are hidden because the cards are generated from article sentences.

## Study View

Study mode shows one card.

### Front

The front side shows:

- `Question` or `Sentence X of Y`
- pronunciation count
- `currentCard.front`
- tap-to-reveal hint

### Back

The back side shows:

- optional AI explanation
- answer label
- pronunciation count
- either full answer or cloze exercise
- audio buttons
- AI explain button
- slow word-by-word button for longer French
- snooze/delete actions in normal SRS mode

## Bottom Controls

The bottom control area changes by mode:

### Auto Preview

Shows a message that auto display will advance and progress is not recorded.

### Sequence Mode

Shows:

- Previous
- Restart
- Next / Finish

### Normal SRS Mode

If the card is flipped, shows four rating buttons:

- Again
- Hard
- Good
- Easy

Each button displays the next due label calculated from `srsService`.

If the card is not flipped, it shows:

```text
Flip card to rate
```

## Confirm Modal

The shared `ConfirmModal` is used for:

- delete confirmation
- snooze confirmation

The modal content changes based on:

```ts
pendingConfirm?.type
```

## Edit Modal

The edit modal is rendered when:

```ts
editingCard !== null
```

It contains:

- front textarea
- back textarea
- cancel button
- save button

Saving calls `handleEditSave`.

## Design Trade-offs

### Why the component is large

This component contains multiple feature areas:

- SRS queue
- audio
- AI
- auto-preview
- cloze
- article sequence mode
- edit/delete/snooze

For a production refactor, the best split would be:

- `useFlashcardQueue`
- `useFlashcardAudio`
- `useAutoPreview`
- `FlashcardHeader`
- `FlashcardCard`
- `FlashcardControls`
- `FlashcardGallery`
- `EditCardModal`

### Why parent callbacks are used

The component does not directly mutate app-level data. It calls:

```ts
onUpdateCard(...)
onDeleteCard(...)
```

This keeps the source of truth in `App.tsx`, while `FlashcardView` controls the study session experience.

### Why refs are used for auto-preview

Timers and async audio callbacks need mutable values that survive renders without causing rerenders. Refs are appropriate for this.

### Why sequence mode disables SRS

Article sequence cards are generated from article text. They are not normal saved flashcards, so updating SRS on them would create confusing progress data.

## Quick Reading Checklist

Read the file in this order:

1. Props interface.
2. Queue initialization effect.
3. State variables.
4. Audio handlers.
5. `handleRate`.
6. Snooze/delete/edit handlers.
7. Sequence navigation handlers.
8. Auto-preview effect.
9. Keyboard shortcut effect.
10. Render structure.

If you understand those ten sections, you understand the component.

