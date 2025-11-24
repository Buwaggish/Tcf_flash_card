import { GoogleGenAI, Modality } from "@google/genai";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: '' });

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
 * @param text The text to speak (French).
 * @returns AudioBuffer ready to play.
 */
export const generateSpeech = async (text: string, audioContext: AudioContext): Promise<AudioBuffer> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Using Kore as a generic clear voice
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
    // Note: decodeAudioData detaches the buffer, so we operate on a copy if needed, 
    // but here we just consume the result.
    const decodedBuffer = await audioContext.decodeAudioData(audioData.buffer);
    return decodedBuffer;

  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};