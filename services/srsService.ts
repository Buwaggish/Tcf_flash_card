import { Flashcard, SRSData } from "../types";

// Grades: 
// 0: Again (Fail)
// 1: Hard
// 2: Good
// 3: Easy

export const INITIAL_SRS_DATA: SRSData = {
  interval: 0,
  repetition: 0,
  easeFactor: 2.5,
  dueDate: Date.now(),
};

/**
 * Calculates the new SRS state based on user feedback.
 * 
 * Intervals:
 * Again -> 5 minutes
 * Hard  -> 20 minutes
 * Good  -> 1 day
 * Easy  -> 7 days
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

  if (grade === 'again') {
      // FAIL: Review in 5 minutes
      repetition = 0;
      interval = 0; 
      addedTime = 5 * MINUTE;
      
      // Decrease ease
      easeFactor = Math.max(1.3, easeFactor - 0.2);
  } 
  else if (grade === 'hard') {
      // HARD: Review in 20 minutes
      interval = 0;
      addedTime = 20 * MINUTE;
      
      easeFactor = Math.max(1.3, easeFactor - 0.15);
  }
  else if (grade === 'good') {
      // GOOD: 1 Day (if new)
      if (repetition === 0) {
          interval = 1;
          addedTime = 1 * DAY;
      } else {
          // Standard SM2 growth
          interval = Math.max(1, Math.round(interval * easeFactor));
          addedTime = interval * DAY;
      }
      repetition += 1;
  }
  else if (grade === 'easy') {
      // EASY: 7 Days (if new)
      if (repetition === 0) {
          interval = 7;
          addedTime = 7 * DAY;
      } else {
          // Bonus growth
          interval = Math.max(1, Math.round(interval * easeFactor * 1.3));
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

// Broad check for UI "Due" badge (includes New cards)
export const isCardDue = (card: Flashcard): boolean => {
  if (!card.srs) return true; // New card is treated as due
  return card.srs.dueDate <= Date.now();
};

// Strict priority helper for Sorting
// 0: Active Due (Has SRS, Time passed) - Priority High
// 1: New (No SRS) - Priority Medium
// 2: Future (Has SRS, Time future) - Priority Low
export const getCardPriority = (card: Flashcard): number => {
    if (!card.srs) return 1; // New
    if (card.srs.dueDate <= Date.now()) return 0; // Active Due
    return 2; // Future
};

export const getCardStatusLabel = (card: Flashcard): { label: string, type: 'new' | 'due' | 'ok' } => {
  if (!card.srs) return { label: 'New', type: 'new' };
  if (card.srs.dueDate <= Date.now()) return { label: 'Due', type: 'due' };
  
  return { label: getDueDateLabel(card.srs.dueDate), type: 'ok' };
};