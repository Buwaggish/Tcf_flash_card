let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export const stopAzureTTS = () => {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {
      console.error("Failed to stop Azure TTS", e);
    }
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
  }
  currentAudio = null;
  currentUrl = null;
};

export const playAzureTTS = async (
  text: string,
  region: string,
  key: string
): Promise<void> => {
  if (!region || !key) {
    throw new Error("Azure configuration missing");
  }

  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  // SSML for French (Canada) - Male Neural voice (Antoine)
  const ssml = `
    <speak version='1.0' xml:lang='fr-CA'>
      <voice xml:lang='fr-CA' xml:gender='Male' name='fr-CA-AntoineNeural'>
        ${text}
      </voice>
    </speak>
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'TCF-Flashcards'
      },
      body: ssml
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Azure Error: ${response.status} - ${errText}`);
    }

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    stopAzureTTS();
    currentAudio = audio;
    currentUrl = audioUrl;

    return new Promise((resolve, reject) => {
        audio.onended = () => {
            stopAzureTTS();
            resolve();
        };
        audio.onerror = (e) => {
            stopAzureTTS();
            reject(new Error("Audio playback failed"));
        };
        
        // Attempt to play
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                URL.revokeObjectURL(audioUrl);
                reject(error);
            });
        }
    });

  } catch (error) {
    console.error("Azure TTS Error:", error);
    throw error;
  }
};
