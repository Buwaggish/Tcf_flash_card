let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentReject: ((reason?: any) => void) | null = null;

const getAudioElement = () => {
  if (!currentAudio) {
    currentAudio = new Audio();
    currentAudio.preload = 'auto';
    currentAudio.setAttribute('playsinline', 'true');
    currentAudio.setAttribute('webkit-playsinline', 'true');
  }
  return currentAudio;
};

const clearAudio = () => {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
  }
  currentUrl = null;
  currentReject = null;
};

export const stopAzureTTS = (options?: { silent?: boolean }) => {
  const audio = currentAudio;
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (e) {
      console.error("Failed to stop Azure TTS", e);
    }
  }

  // Signal an abort to any waiter so it doesn't treat this as a completion
  if (!options?.silent && currentReject) {
    const rejectFn = currentReject;
    currentReject = null;
    rejectFn(new DOMException("Playback stopped", "AbortError"));
  }

  clearAudio();
};

const playWithAudioElement = async (
  blob: Blob,
  options?: { resolveOnStart?: boolean }
): Promise<void> => {
  const audioUrl = URL.createObjectURL(blob);

  // Stop any existing playback quietly before starting a new one
  stopAzureTTS({ silent: true });
  const audio = getAudioElement();
  audio.src = audioUrl;
  audio.load();
  currentAudio = audio;
  currentUrl = audioUrl;

  return new Promise((resolve, reject) => {
    currentReject = reject;

    audio.onended = () => {
      clearAudio();
      resolve();
    };

    audio.onerror = () => {
      clearAudio();
      reject(new Error("Audio playback failed"));
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        if (options?.resolveOnStart) {
          resolve();
        }
      }).catch(err => {
        clearAudio();
        reject(err);
      });
    } else if (options?.resolveOnStart) {
      resolve();
    }
  });
};

export const playAzureTTS = async (
  text: string,
  region: string,
  key: string,
  options?: { resolveOnStart?: boolean }
): Promise<void> => {
  if (!region || !key) {
    throw new Error("Azure configuration missing");
  }

  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const ssml = `
    <speak version='1.0' xml:lang='fr-CA'>
      <voice xml:lang='fr-CA' xml:gender='Female' name='fr-FR-VivienneMultilingualNeural'>
        ${text}
      </voice>
    </speak>
  `;

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
  return playWithAudioElement(blob, options);
};
