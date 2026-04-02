export interface SRSData {
  interval: number; // Days between reviews
  repetition: number; // Number of consecutive successful reviews
  easeFactor: number; // Difficulty multiplier (starts at 2.5)
  dueDate: number; // Timestamp (ms) when card is next due
}

export interface Flashcard {
  id: string;
  front: string; // The question or prompt
  back: string;  // The answer (French)
  mastered: boolean; // Kept for legacy/manual override
  srs?: SRSData; // Optional for backward compatibility
}

export type StudyMode = 'srs' | 'sequence';

export interface Unit {
  id: string;
  name: string; // e.g., "Unit 1"
  cards: Flashcard[];
}

export interface Category {
  id: string;
  name: string; // e.g., "Compréhension Orale"
  units: Unit[];
}

export type AppData = Category[];

export interface ImportItem {
  category: string;
  unit: string;
  front: string;
  back: string;
}

export interface LongArticle {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export enum ViewState {
  HOME = 'HOME',
  CATEGORY = 'CATEGORY',
  STUDY = 'STUDY',
  STUDY_ALL = 'STUDY_ALL',
  AUTO_PREVIEW = 'AUTO_PREVIEW',
  LONG_ARTICLE = 'LONG_ARTICLE',
  ARTICLE_FLASHCARDS = 'ARTICLE_FLASHCARDS'
}
