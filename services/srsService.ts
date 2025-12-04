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
 * Calculates the new SRS state.
 * Implements user requested fixed intervals for initial learning:
 * Again -> 5 min
 * Hard -> 20 min
 * Good -> 1 day
 * Easy -> 7 days
 */
export const calculateNextReview = (
  currentSRS: SRSData | undefined, 
  grade: 'again' | 'hard' | 'good' | 'easy'
): SRSData => {
  const srs = currentSRS || { ...INITIAL_SRS_DATA };
  
  let { interval, repetition, easeFactor } = srs;
  
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  
  let addedTime = 0;

  // Logic splits based on whether card is "New/Learning" (repetition === 0) or "Graduated"
  
  if (grade === 'again') {
      // FAIL: Reset progress, review in 5 minutes
      repetition = 0;
      interval = 0; // 0 indicates < 1 day
      addedTime = 5 * MINUTE;
      
      // Decrease ease slightly
      easeFactor = Math.max(1.3, easeFactor - 0.2);
  } 
  else if (grade === 'hard') {
      // HARD: Review in 20 minutes
      // We treat 'Hard' as a short-term step if interval is small
      interval = 0;
      addedTime = 20 * MINUTE;
      
      easeFactor = Math.max(1.3, easeFactor - 0.15);
  }
  else if (grade === 'good') {
      // GOOD: Standard progress
      if (repetition === 0) {
          // New card -> 1 Day
          interval = 1;
          addedTime = 1 * DAY;
      } else {
          // Graduated -> Interval * Ease
          interval = Math.max(1, Math.floor(interval * easeFactor));
          addedTime = interval * DAY;
      }
      repetition += 1;
  }
  else if (grade === 'easy') {
      // EASY: Bonus jump
      if (repetition === 0) {
          // New card -> 7 Days
          interval = 7;
          addedTime = 7 * DAY;
      } else {
          // Graduated -> Interval * Ease * Bonus
          interval = Math.max(1, Math.floor(interval * easeFactor * 1.3));
          addedTime = interval * DAY;
      }
      repetition += 1;
      easeFactor += 0.15;
  }

  return {
    interval,
    repetition,
    easeFactor,
    dueDate: Date.now() + addedTime
  };
};

export const getDueDateLabel = (timestamp: number): string => {
  const diff = timestamp - Date.now();
  
  if (diff <= 0) return "Now";
  
  const minutes = Math.ceil(diff / (60 * 1000));
  if (minutes < 60) return `${minutes}m`;
  
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;
  
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  return `${days}d`;
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