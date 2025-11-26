import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Flashcard } from '../types';
import { getFrenchVoices, speak, cancelSpeech } from '../services/ttsService';
import { playAzureTTS } from '../services/azureService';
import { ArrowLeft, RefreshCw, Volume2, Play, Settings, CloudLightning, Save } from 'lucide-react';

interface FlashcardViewProps {
  cards: Flashcard[];
  title: string;
  onBack: () => void;
  unitId: string;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({ cards, title, onBack, unitId }) => {
  const storageKey = `tcf-progress-${unitId}`;
  
  // Audio Context Ref for Azure
  const audioContextRef = useRef<AudioContext | null>(null);

  const [currentIndex, setCurrentIndex] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? parseInt(saved, 10) : 0;
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

  // Azure State
  const [azureRegion, setAzureRegion] = useState(() => localStorage.getItem('tcf-azure-region') || '');
  const [azureKey, setAzureKey] = useState(() => localStorage.getItem('tcf-azure-key') || '');
  const [showAzureSettings, setShowAzureSettings] = useState(false);

  const currentCard = cards[currentIndex];
  const isFrenchLong = currentCard.back.split(' ').length > 4;

  useEffect(() => {
    localStorage.setItem(storageKey, currentIndex.toString());
  }, [currentIndex, storageKey]);

  useEffect(() => {
    const loadVoices = () => {
      const available = getFrenchVoices();
      setVoices(available);
      const savedVoice = localStorage.getItem('tcf-tts-voice');
      if (savedVoice && available.some(v => v.name === savedVoice)) {
        setSelectedVoiceName(savedVoice);
      } else if (available.length > 0) {
        setSelectedVoiceName(available[0].name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    // Init AudioContext for Azure
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      cancelSpeech();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
      }
    };
  }, []);

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedVoiceName(name);
    localStorage.setItem('tcf-tts-voice', name);
  };

  const handleAzureSave = () => {
      localStorage.setItem('tcf-azure-region', azureRegion);
      localStorage.setItem('tcf-azure-key', azureKey);
      setShowAzureSettings(false);
      alert("Azure settings saved.");
  };

  const getSelectedVoice = useCallback(() => {
    return voices.find(v => v.name === selectedVoiceName) || null;
  }, [voices, selectedVoiceName]);

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

  const handleCloudPlay = useCallback(async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isPlaying) return;
      
      if (!azureRegion || !azureKey) {
          setShowAzureSettings(true);
          setShowVoiceSettings(true); // Expand settings panel
          return;
      }

      try {
          setIsPlaying(true);
          cancelSpeech(); // Stop browser TTS
          if (audioContextRef.current?.state === 'suspended') {
              await audioContextRef.current.resume();
          }
          if (audioContextRef.current) {
             await playAzureTTS(currentCard.back, azureRegion, azureKey, audioContextRef.current);
          }
      } catch (err) {
          console.error("Cloud playback error", err);
          alert("Azure TTS failed. Check Console or Keys.");
      } finally {
          setIsPlaying(false);
      }
  }, [isPlaying, currentCard.back, azureRegion, azureKey]);

  const handlePlaySequence = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isPlaying) return;

    const words = currentCard.back.split(' ');
    const voice = getSelectedVoice();

    try {
      setIsPlaying(true);
      cancelSpeech();
      for (const word of words) {
        await speak(word, voice, 0.9);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === ' ' || e.key === 'Enter') {
        setIsFlipped((p) => !p);
      } else if (e.key === 'ArrowRight') {
        nextCard();
      } else if (e.key === 'ArrowLeft') {
        prevCard();
      } else if (e.key.toLowerCase() === 'p') {
        handlePlayAudio();
      } else if (e.key.toLowerCase() === 'o') {
        handleCloudPlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextCard, prevCard, handlePlayAudio, handleCloudPlay]);

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 relative">
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => { cancelSpeech(); onBack(); }}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        
        <div className="flex items-center gap-4">
          <div className="text-slate-400 text-sm font-mono">
            {currentIndex + 1} / {cards.length}
          </div>
          <button 
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className={`p-2 rounded-lg transition ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Audio Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showVoiceSettings && (
        <div className="mb-6 space-y-4 bg-slate-800 rounded-xl border border-slate-700 p-4 animate-in fade-in slide-in-from-top-2">
          {/* Browser Voice */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Local Voice</label>
            <div className="flex gap-2">
                <select 
                    value={selectedVoiceName} 
                    onChange={handleVoiceChange}
                    className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                >
                    {voices.length === 0 && <option value="">Loading voices...</option>}
                    {voices.map((v) => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                    ))}
                </select>
                <button onClick={handlePlayAudio} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">Test</button>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4">
             <div className="flex items-center justify-between mb-2">
                 <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    <CloudLightning className="w-3 h-3" />
                    Azure Cloud Voice
                 </label>
                 <button onClick={() => setShowAzureSettings(!showAzureSettings)} className="text-xs text-slate-400 hover:text-white underline">
                     {showAzureSettings ? 'Hide Config' : 'Configure'}
                 </button>
             </div>
             
             {showAzureSettings && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2 p-3 bg-slate-900/50 rounded-lg">
                    <input 
                        placeholder="Region (e.g. eastus)" 
                        value={azureRegion}
                        onChange={(e) => setAzureRegion(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <input 
                        type="password"
                        placeholder="API Key" 
                        value={azureKey}
                        onChange={(e) => setAzureKey(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <button onClick={handleAzureSave} className="md:col-span-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1 rounded flex items-center justify-center gap-1">
                        <Save className="w-3 h-3" /> Save Azure Settings
                    </button>
                 </div>
             )}
             <p className="text-xs text-slate-500">
                Requires an Azure Speech Key. Press 'O' to play using high-quality Neural voice.
             </p>
          </div>
        </div>
      )}

      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-white">{title}</h2>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-[50vh] perspective-1000 mb-8">
        <div 
          className={`relative w-full max-w-lg transition-all duration-500 transform-style-3d cursor-pointer group 
            h-[50vh] md:h-auto md:aspect-[4/3]
            ${isFlipped ? 'rotate-y-180' : ''}`}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          {/* Front */}
          <div className="absolute inset-0 backface-hidden bg-slate-800 border-2 border-slate-700 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 group-hover:border-indigo-500/50 transition">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Question</span>
            <p className="text-2xl md:text-3xl text-center font-medium text-slate-100 leading-relaxed overflow-y-auto max-h-[70%]">
              {currentCard.front}
            </p>
            <p className="mt-auto md:mt-8 text-sm text-slate-500 animate-pulse pt-4">Tap to flip</p>
          </div>

          {/* Back */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-900/20 border-2 border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 backdrop-blur-sm">
             <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Réponse</span>
            <p className="text-2xl md:text-3xl text-center font-medium text-white leading-relaxed overflow-y-auto max-h-[60%] mb-4">
              {currentCard.back}
            </p>
            
            <div className="mt-auto flex flex-wrap justify-center gap-3 pt-4 border-t border-white/10 w-full" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={handlePlayAudio}
                disabled={isPlaying}
                title="Play Local (P)"
                className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-full text-white shadow-lg transition text-sm md:text-base"
              >
                {isPlaying && !isFrenchLong ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                <span>Local</span>
              </button>

              <button
                onClick={handleCloudPlay}
                disabled={isPlaying || !azureKey}
                title="Play Cloud (O)"
                className={`flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 rounded-full shadow-lg transition text-sm md:text-base ${azureKey ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`}
              >
                {isPlaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudLightning className="w-4 h-4" />}
                <span>Cloud</span>
              </button>

              {isFrenchLong && (
                <button
                  onClick={handlePlaySequence}
                  disabled={isPlaying}
                  className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-full text-white shadow-lg transition text-sm md:text-base"
                  title="Read word by word"
                >
                   <Play className="w-4 h-4" />
                   <span className="hidden md:inline">Slow</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto flex justify-center gap-6 pb-6">
        <button 
          onClick={prevCard}
          className="p-4 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setIsFlipped(!isFlipped)}
          className="p-4 rounded-full bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 hover:text-white transition border border-indigo-500/30"
        >
          <RefreshCw className="w-6 h-6" />
        </button>
        <button 
          onClick={nextCard}
          className="p-4 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
        >
          <ArrowRightIcon />
        </button>
      </div>
    </div>
  );
};

const ArrowRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);