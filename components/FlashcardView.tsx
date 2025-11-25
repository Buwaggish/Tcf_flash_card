import React, { useState, useEffect, useCallback } from 'react';
import { Flashcard } from '../types';
import { getFrenchVoices, speak, cancelSpeech } from '../services/ttsService';
import { ArrowLeft, RefreshCw, Volume2, Play, Settings } from 'lucide-react';

interface FlashcardViewProps {
  cards: Flashcard[];
  title: string;
  onBack: () => void;
  unitId: string;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({ cards, title, onBack, unitId }) => {
  // Storage Key for persistence
  const storageKey = `tcf-progress-${unitId}`;

  // Initialize state from storage
  const [currentIndex, setCurrentIndex] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? parseInt(saved, 10) : 0;
      // Ensure saved index is within valid bounds
      return (parsed >= 0 && parsed < cards.length) ? parsed : 0;
    } catch {
      return 0;
    }
  });

  const [isFlipped, setIsFlipped] = useState(false);

  // TTS State
  const [isPlaying, setIsPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  const currentCard = cards[currentIndex];
  const isFrenchLong = currentCard.back.split(' ').length > 4;

  // Persist progress whenever index changes
  useEffect(() => {
    localStorage.setItem(storageKey, currentIndex.toString());
  }, [currentIndex, storageKey]);

  // Load voices on mount
  useEffect(() => {
    const loadVoices = () => {
      const available = getFrenchVoices();
      setVoices(available);

      // recover saved voice preference
      const savedVoice = localStorage.getItem('tcf-tts-voice');
      if (savedVoice && available.some(v => v.name === savedVoice)) {
        setSelectedVoiceName(savedVoice);
      } else if (available.length > 0) {
        // Default to first available if nothing saved
        setSelectedVoiceName(available[0].name);
      }
    };

    loadVoices();

    // Chrome loads voices asynchronously
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      cancelSpeech(); // Cleanup any ongoing speech
    };
  }, []);

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedVoiceName(name);
    localStorage.setItem('tcf-tts-voice', name);
  };

  const getSelectedVoice = useCallback(() => {
    return voices.find(v => v.name === selectedVoiceName) || null;
  }, [voices, selectedVoiceName]);

  // Play normal speed
  const handlePlayAudio = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isPlaying) return;

    try {
      setIsPlaying(true);
      cancelSpeech();
      await speak(currentCard.back, getSelectedVoice());
    } catch (err) {
      console.error("Playback error", err);
    } finally {
      setIsPlaying(false);
    }
  }, [isPlaying, currentCard.back, getSelectedVoice]);

  // Play word-by-word if long
  const handlePlaySequence = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isPlaying) return;

    const words = currentCard.back.split(' ');
    const voice = getSelectedVoice();

    try {
      setIsPlaying(true);
      cancelSpeech();

      for (const word of words) {
        await speak(word, voice, 0.9); // Slightly slower rate for clarity
        await new Promise(r => setTimeout(r, 200));
      }

    } catch (err) {
      console.error("Sequence playback error", err);
    } finally {
      setIsPlaying(false);
    }
  };

  const nextCard = useCallback(() => {
    cancelSpeech();
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % cards.length);
    }, 200);
  }, [cards.length]);

  const prevCard = useCallback(() => {
    cancelSpeech();
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev === 0 ? cards.length - 1 : prev - 1));
    }, 200);
  }, [cards.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === ' ' || e.key === 'Enter') {
        setIsFlipped((p) => !p);
      } else if (e.key === 'ArrowRight') {
        nextCard();
      } else if (e.key === 'ArrowLeft') {
        prevCard();
      } else if (e.key.toLowerCase() === 'p') {
        handlePlayAudio();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextCard, prevCard, handlePlayAudio]);

  return (
      <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
              onClick={() => { cancelSpeech(); onBack(); }}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Deck</span>
          </button>

          <div className="flex items-center gap-4">
            <div className="text-slate-400 text-sm font-mono">
              {currentIndex + 1} / {cards.length}
            </div>
            <button
                onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                className={`p-2 rounded-lg transition ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Voice Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Voice Selection Panel */}
        {showVoiceSettings && (
            <div className="mb-6 p-4 bg-slate-800 rounded-xl border border-slate-700 animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select Pronunciation Voice</label>
                <div className="flex gap-2">
                  <select
                      value={selectedVoiceName}
                      onChange={handleVoiceChange}
                      className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {voices.length === 0 && <option value="">Loading voices...</option>}
                    {voices.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                    ))}
                  </select>
                  <button
                      onClick={handlePlayAudio}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm"
                  >
                    Test
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  * Note: Voices provided by your browser. "Google Français" or standard system voices are recommended.
                </p>
              </div>
            </div>
        )}

        <div className="text-center mb-4">
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>

        {/* Card Area */}
        <div className="flex-1 flex items-center justify-center min-h-[400px] perspective-1000">
          <div
              className={`relative w-full max-w-lg aspect-[4/3] transition-all duration-500 transform-style-3d cursor-pointer group ${isFlipped ? 'rotate-y-180' : ''}`}
              onClick={() => setIsFlipped(!isFlipped)}
          >
            {/* Front */}
            <div className="absolute inset-0 backface-hidden bg-slate-800 border-2 border-slate-700 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 group-hover:border-indigo-500/50 transition">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Question</span>
              <p className="text-3xl text-center font-medium text-slate-100 leading-relaxed">
                {currentCard.front}
              </p>
              <p className="mt-8 text-sm text-slate-500 animate-pulse">Tap to flip</p>
            </div>

            {/* Back */}
            <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-900/20 border-2 border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 backdrop-blur-sm">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Réponse</span>
              <p className="text-3xl text-center font-medium text-white leading-relaxed">
                {currentCard.back}
              </p>

              {/* Audio Controls - Sticky inside card */}
              <div className="mt-8 flex gap-3" onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={handlePlayAudio}
                    disabled={isPlaying}
                    title="Play (P)"
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-white shadow-lg transition"
                >
                  {isPlaying && !isFrenchLong ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                      <Volume2 className="w-4 h-4" />
                  )}
                  <span>Play</span>
                </button>

                {isFrenchLong && (
                    <button
                        onClick={handlePlaySequence}
                        disabled={isPlaying}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-white shadow-lg transition"
                        title="Read word by word"
                    >
                      {isPlaying ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                          <Play className="w-4 h-4" />
                      )}
                      <span className="text-xs">Word-by-Word</span>
                    </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="mt-8 flex justify-center gap-6">
          <button
              onClick={prevCard}
              title="Previous (Left Arrow)"
              className="p-4 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <button
              onClick={() => {
                setIsFlipped(!isFlipped);
              }}
              title="Flip (Space/Enter)"
              className="p-4 rounded-full bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 hover:text-white transition border border-indigo-500/30"
          >
            <RefreshCw className="w-6 h-6" />
          </button>
          <button
              onClick={nextCard}
              title="Next (Right Arrow)"
              className="p-4 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
          >
            <ArrowRightIcon />
          </button>
        </div>
      </div>
  );
};

const ArrowRightIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
);