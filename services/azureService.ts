export const playAzureTTS = async (
  text: string,
  region: string,
  key: string,
  audioContext: AudioContext
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

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Play Audio
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);

    return new Promise((resolve) => {
        source.onended = () => resolve();
    });

  } catch (error) {
    console.error("Azure TTS Error:", error);
    throw error;
  }
};