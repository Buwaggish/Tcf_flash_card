export const splitIntoSentences = (text: string): string[] => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const matches = normalized.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g);
  return (matches || []).map(sentence => sentence.trim()).filter(Boolean);
};
