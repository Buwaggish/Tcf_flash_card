let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
// 新增：用来存储当前正在播放的 Promise 的 resolve 方法
let currentResolve: (() => void) | null = null;

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

    // 🟢 关键修复：如果当前有正在等待的 Promise，强制让它结束
    // 这样 await playAzureTTS 就不会永远卡住，也不会报错，而是正常结束
    if (currentResolve) {
        currentResolve();
        currentResolve = null;
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

    // SSML for French (Canada)
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

        // 停止之前的播放（如果有）
        stopAzureTTS();

        currentAudio = audio;
        currentUrl = audioUrl;

        return new Promise((resolve, reject) => {
            // 🟢 捕获 resolve 函数，以便外部 stopAzureTTS 可以调用它
            currentResolve = resolve;

            audio.onended = () => {
                // 正常播放结束
                currentResolve = null; // 清理引用
                stopAzureTTS(); // 清理资源
                resolve();
            };

            audio.onerror = (e) => {
                currentResolve = null;
                stopAzureTTS();
                console.error("Audio playback error event:", e); // 打印详细错误
                reject(new Error("Audio playback failed"));
            };

            // 尝试播放
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn("⚠️ Autoplay blocked or failed:", error); // 🟡 重点看控制台有没有这个
                    URL.revokeObjectURL(audioUrl);
                    currentResolve = null;
                    reject(error); // 这里 reject 会导致外部跳过等待，直接进入 catch
                });
            }
        });

    } catch (error) {
        console.error("Azure TTS Error:", error);
        throw error;
    }
};