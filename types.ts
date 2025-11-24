export interface Flashcard {
  id: string;
  front: string; // The question or prompt (e.g., English or Image description)
  back: string;  // The answer (French)
  mastered: boolean;
}

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

export enum ViewState {
  HOME = 'HOME',
  CATEGORY = 'CATEGORY',
  STUDY = 'STUDY'
}