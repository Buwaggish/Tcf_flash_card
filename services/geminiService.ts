import { GoogleGenAI, Modality } from "@google/genai";

// Helper to decode Base64 to ArrayBuffer for audio context
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates speech from text using Gemini 2.5 Flash TTS.
 */
export const generateSpeech = async (text: string, audioContext: AudioContext, apiKey: string): Promise<AudioBuffer> => {
  if (!apiKey) throw new Error("Google API Key is missing");
  
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, 
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("No audio data returned from Gemini.");
    }

    const audioData = decode(base64Audio);
    
    // Decode the audio data into a buffer
    const decodedBuffer = await audioContext.decodeAudioData(audioData.buffer);
    return decodedBuffer;

  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};

/**
 * Generates contextual explanation for a flashcard term.
 */
export const generateCardContext = async (term: string, apiKey: string): Promise<string> => {
  if (!apiKey) throw new Error("Google API Key is missing");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const prompt = `
You are a professional French instructor specializing in TCF-Canada exam preparation.

Explain the French term or expression: “${term}”.

Response requirements (maximum 80 words total):
	1.	Definition — clear and simple French, suitable for B1–B2 level
	2.	Example sentence — highly likely to appear in a TCF-Canada exam context (immigration, work, housing, healthcare, daily administration in Canada)
	3.	Chinese translation — translate both the term and the example sentence into Chinese
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "No explanation available.";
  } catch (error) {
    console.error("Context generation error:", error);
    return "Error generating context. Please check your API Key.";
  }
};