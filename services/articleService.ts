import { Flashcard, LongArticle } from '../types';
import { splitIntoSentences } from './textSegmentation';

export const mergeLongArticles = (base: LongArticle[], incoming: LongArticle[]): LongArticle[] => {
  const map = new Map<string, LongArticle>();
  base.forEach(article => map.set(article.id, article));
  incoming.forEach(article => {
    const existing = map.get(article.id);
    if (!existing || (article.updatedAt || 0) >= (existing.updatedAt || 0)) {
      map.set(article.id, article);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
};

export const buildArticleSequenceCards = (article: LongArticle): Flashcard[] => {
  const sentences = splitIntoSentences(article.content);

  return sentences.map((sentence, index) => {
    const previousSentence = sentences[index - 1];
    const prompt = index === 0
      ? `Opening sentence\n\nStart your response for "${article.title}". What is the first sentence?`
      : `Sentence ${index + 1} of ${sentences.length}\n\nPrevious sentence:\n${previousSentence}\n\nWhat comes next?`;

    return {
      id: `article-sequence-${article.id}-${String(index + 1).padStart(4, '0')}`,
      front: prompt,
      back: sentence,
      mastered: false
    };
  });
};
