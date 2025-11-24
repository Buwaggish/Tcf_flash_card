/**
 * Service to handle Browser Native Text-to-Speech
 */

export const cancelSpeech = () => {
  window.speechSynthesis.cancel();
};

/**
 * Filters and deduplicates available voices for French.
 */
export const getFrenchVoices = (): SpeechSynthesisVoice[] => {
  const allVoices = window.speechSynthesis.getVoices();
  
  // Filter for French languages (fr-FR, fr-CA, etc.)
  const frenchVoices = allVoices.filter(voice => 
    voice.lang.toLowerCase().includes('fr')
  );

  // Deduplicate by name
  const uniqueVoices: SpeechSynthesisVoice[] = [];
  const seenNames = new Set<string>();

  frenchVoices.forEach(voice => {
    if (!seenNames.has(voice.name)) {
      seenNames.add(voice.name);
      uniqueVoices.push(voice);
    }
  });

  // Sort by name for easier finding
  return uniqueVoices.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Speaks the text using the provided voice.
 * Returns a promise that resolves when speech ends.
 */
export const speak = (text: string, voice: SpeechSynthesisVoice | null, rate: number = 1): Promise<void> => {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (voice) {
      utterance.voice = voice;
    } else {
      // Fallback if no specific voice selected, though browser usually handles this
      utterance.lang = 'fr-FR'; 
    }
    
    utterance.rate = rate;

    utterance.onend = () => {
      resolve();
    };

    utterance.onerror = (e) => {
      // 'interrupted' or 'canceled' are common when stopping manually
      console.warn("TTS Error or Interruption:", e);
      resolve(); 
    };

    window.speechSynthesis.speak(utterance);
  });
};
