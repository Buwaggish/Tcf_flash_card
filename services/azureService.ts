let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentReject: ((reason?: any) => void) | null = null;
let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

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

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (audioContext && audioContext.state !== 'closed') return audioContext;

  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) return null;

  audioContext = new AudioContextCtor();
  return audioContext;
};

export const unlockAzureAudioPlayback = async (): Promise<void> => {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === 'suspended') {
    await context.resume();
  }

  const source = context.createBufferSource();
  source.buffer = context.createBuffer(1, 1, 22050);
  source.connect(context.destination);
  source.start(0);
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

  if (currentSource) {
    try {
      currentSource.stop();
    } catch (e) {
      console.error("Failed to stop Azure Web Audio", e);
    }
    currentSource.disconnect();
    currentSource = null;
  }

  // Signal an abort to any waiter so it doesn't treat this as a completion
  if (!options?.silent && currentReject) {
    const rejectFn = currentReject;
    currentReject = null;
    rejectFn(new DOMException("Playback stopped", "AbortError"));
  }

  clearAudio();
};

const playWithAudioContext = async (
  blob: Blob,
  options?: { resolveOnStart?: boolean }
): Promise<void> => {
  const context = getAudioContext();
  if (!context) {
    throw new Error("Web Audio is not available");
  }

  if (context.state === 'suspended') {
    await context.resume();
  }

  stopAzureTTS({ silent: true });

  const source = context.createBufferSource();
  const audioBuffer = await context.decodeAudioData(await blob.arrayBuffer());
  source.buffer = audioBuffer;
  source.connect(context.destination);
  currentSource = source;

  return new Promise((resolve, reject) => {
    currentReject = reject;
    source.onended = () => {
      if (currentSource === source) {
        currentSource.disconnect();
        currentSource = null;
      }
      currentReject = null;
      resolve();
    };

    try {
      source.start(0);
      if (options?.resolveOnStart) {
        resolve();
      }
    } catch (err) {
      currentSource = null;
      currentReject = null;
      reject(err);
    }
  });
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
  if (audioContext) {
    return playWithAudioContext(blob, options);
  }

  return playWithAudioElement(blob, options);
};
