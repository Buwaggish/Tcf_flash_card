import { Flashcard, SRSData } from "../types";

// Grades: 
// 0: Again (Complete blackout)
// 1: Hard (Remembered with great difficulty)
// 2: Good (Remembered with some hesitation)
// 3: Easy (Perfect recall)

export const INITIAL_SRS_DATA: SRSData = {
  interval: 0,
  repetition: 0,
  easeFactor: 2.5,
  dueDate: Date.now(),
};

/**
 * Calculates the new SRS state for a card based on the user's rating.
 * Based on a simplified SM-2 algorithm.
 */
export const calculateNextReview = (
  currentSRS: SRSData | undefined, 
  grade: 'again' | 'hard' | 'good' | 'easy'
): SRSData => {
  const srs = currentSRS || { ...INITIAL_SRS_DATA };
  
  let { interval, repetition, easeFactor } = srs;
  
  // Mapping buttons to SM-2 numeric quality (0-5 scale roughly)
  // We simplify to 4 buttons for UX
  let quality = 0;
  switch (grade) {
    case 'again': quality = 0; break; // Fail
    case 'hard': quality = 3; break;  // Pass but difficult
    case 'good': quality = 4; break;  // Pass
    case 'easy': quality = 5; break;  // Perfect
  }

  if (quality < 3) {
    // If failed, reset repetitions and start over interval
    repetition = 0;
    interval = 1; 
  } else {
    // If passed
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetition += 1;
  }

  // Update Ease Factor (standard SM-2 formula)
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3; // Minimum floor

  // Add random "fuzz" to interval to prevent card bunching on the same day
  // only if interval is > 2 days
  if (interval > 2) {
      const fuzz = Math.random() * 0.1 + 0.95; // +/- 5%
      interval = Math.floor(interval * fuzz);
  }

  // Calculate Due Date
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  // If 'again', due in 1 minute (effectively immediately for this session) logic handled by queue, 
  // but simpler to just set to tomorrow or "now" + small buffer.
  // For this app, 'again' means "show me again this session" or "reset to day 1".
  // We will set due date to Today + Interval.
  
  const dueDate = Date.now() + (interval * ONE_DAY_MS);

  return {
    interval,
    repetition,
    easeFactor,
    dueDate
  };
};

export const getDueDateLabel = (timestamp: number): string => {
  const diff = timestamp - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  
  if (days <= 0) return "Now";
  if (days === 1) return "1 day";
  return `${days} days`;
};

export const isCardDue = (card: Flashcard): boolean => {
  if (!card.srs) return true; // New card
  return card.srs.dueDate <= Date.now();
};

export const getCardStatusLabel = (card: Flashcard): { label: string, type: 'new' | 'due' | 'ok' } => {
  if (!card.srs) return { label: 'New', type: 'new' };
  if (isCardDue(card)) return { label: 'Due', type: 'due' };
  
  return { label: getDueDateLabel(card.srs.dueDate), type: 'ok' };
};