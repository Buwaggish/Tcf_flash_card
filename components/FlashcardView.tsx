import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Flashcard } from '../types';
import { getFrenchVoices, speak, cancelSpeech } from '../services/ttsService';
import { playAzureTTS } from '../services/azureService';
import { generateCardContext } from '../services/geminiService';
import { calculateNextReview, getDueDateLabel, isCardDue, getCardStatusLabel, getCardPriority, INITIAL_SRS_DATA } from '../services/srsService';
import { ConfirmModal } from './ConfirmModal';
import { ArrowLeft, RefreshCw, Volume2, Play, Settings, CloudLightning, Brain, CheckCircle, List, Layers, Sparkles, Loader2, Save, Key, Clock, RotateCcw, Trash2, Moon } from 'lucide-react';

interface FlashcardViewProps {
  cards: Flashcard[];
  title: string;
  onBack: () => void;
  unitId: string;
  onUpdateCard: (cardId: string, updates: Partial<Flashcard>) => void;
  onDeleteCard?: (cardId: string) => void;
  onStudyActivity?: () => void; 
  todayStudyTime?: number;
  onResetTimer?: () => void;
  autoPreview?: boolean;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({ 
  cards, title, onBack, unitId, onUpdateCard, onDeleteCard, onStudyActivity, todayStudyTime = 0, onResetTimer, autoPreview = false 
}) => {
  const [viewMode, setViewMode] = useState<'study' | 'gallery'>('study');
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [pendingConfirm, setPendingConfirm] = useState<{ type: 'snooze' | 'delete'; card: Flashcard } | null>(null);
  const autoTimerRef = useRef<number | null>(null);

  // Queue Init
  useEffect(() => {
    const filtered = cards.filter(card => !excludedIds.has(card.id));
    const sorted = [...filtered].sort((a, b) => {
        const pA = getCardPriority(a);
        const pB = getCardPriority(b);
        if (pA !== pB) return pA - pB;
        const dateA = a.srs?.dueDate || 0;
        const dateB = b.srs?.dueDate || 0;
        return dateA - dateB;
    });
    
    setStudyQueue(sorted);
    
    if (sorted.length > 0) {
      if (!currentCard) {
          setCurrentCard(sorted[0]);
      } else {
          // Sync existing card if present
          const exists = sorted.find(c => c.id === currentCard.id);
          if (!exists) setCurrentCard(sorted[0]);
      }
      setSessionComplete(false);
    } else {
      setSessionComplete(true);
      setCurrentCard(null);
    }
  }, [cards, excludedIds]); 

  useEffect(() => {
    setExcludedIds(new Set());
  }, [unitId]);

  useEffect(() => {
    if (autoPreview) {
      setViewMode('study');
    }
  }, [autoPreview]);

  const [isFlipped, setIsFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [azureRegion, setAzureRegion] = useState(() => localStorage.getItem('tcf-azure-region') || '');
  const [azureKey, setAzureKey] = useState(() => localStorage.getItem('tcf-azure-key') || '');
  const [showAzureSettings, setShowAzureSettings] = useState(false);
  const [googleKey, setGoogleKey] = useState(() => localStorage.getItem('tcf-google-key') || '');
  const [showGoogleSettings, setShowGoogleSettings] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  useEffect(() => {
      setAiExplanation(null);
      setIsGeneratingAi(false);
  }, [currentCard]);

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
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      cancelSpeech();
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

  const handleGoogleSave = () => {
      localStorage.setItem('tcf-google-key', googleKey);
      setShowGoogleSettings(false);
      alert("Google API Key saved.");
  };

  const getSelectedVoice = useCallback(() => {
    return voices.find(v => v.name === selectedVoiceName) || null;
  }, [voices, selectedVoiceName]);

  const handlePlayAudio = useCallback(async (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isPlaying) return;
    try {
      setIsPlaying(true);
      cancelSpeech();
      await speak(text, getSelectedVoice());
    } catch (err) {
      console.error("Playback error", err);
    } finally {
      setIsPlaying(false);
    }
  }, [isPlaying, getSelectedVoice]);

  const handleCloudPlay = useCallback(async (text: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isPlaying) return;
      if (!azureRegion || !azureKey) {
          setShowAzureSettings(true);
          setShowVoiceSettings(true);
          return;
      }
      try {
          setIsPlaying(true);
          cancelSpeech();
          await playAzureTTS(text, azureRegion, azureKey);
      } catch (err) {
          console.error("Cloud playback error", err);
          alert("Azure TTS failed. Check Console or Keys.");
      } finally {
          setIsPlaying(false);
      }
  }, [isPlaying, azureRegion, azureKey]);

  const handlePlaySequence = async (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isPlaying) return;
    const words = text.split(' ');
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

  const handleAiExplain = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!currentCard || isGeneratingAi) return;
      if (!googleKey) {
          setShowVoiceSettings(true);
          setShowGoogleSettings(true);
          alert("Please configure your Google Gemini API Key first.");
          return;
      }
      setIsGeneratingAi(true);
      try {
          const term = currentCard.back.length < 30 ? currentCard.back : currentCard.front + " " + currentCard.back;
          const context = await generateCardContext(term, googleKey);
          setAiExplanation(context);
      } catch (e) {
          setAiExplanation("Failed to load explanation. Check your API Key.");
      } finally {
          setIsGeneratingAi(false);
      }
  };

  const handleRate = async (grade: 'again' | 'hard' | 'good' | 'easy', e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (autoPreview) return;
    if (!currentCard) return;
    onStudyActivity?.();
    const newSRS = calculateNextReview(currentCard.srs, grade);
    onUpdateCard(currentCard.id, { srs: newSRS });
    cancelSpeech();
    setIsFlipped(false);
    setTimeout(() => {
      const currentIndex = studyQueue.findIndex(c => c.id === currentCard.id);
      if (currentIndex !== -1) {
          const nextQueue = [...studyQueue];
          const isRequeue = newSRS.interval === 0;
          if (isRequeue) {
              nextQueue[currentIndex] = { ...nextQueue[currentIndex], srs: newSRS };
              const [cardToRequeue] = nextQueue.splice(currentIndex, 1);
              nextQueue.push(cardToRequeue);
              setStudyQueue(nextQueue);
              setCurrentCard(nextQueue[0]);
          } else {
              nextQueue.splice(currentIndex, 1);
              setStudyQueue(nextQueue);
              if (nextQueue.length > 0) {
                setCurrentCard(nextQueue[0]);
              } else {
                setCurrentCard(null); 
                setSessionComplete(true);
              }
          }
      }
    }, 150);
  };

  const handleSnooze = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (autoPreview) return;
      if (!currentCard) return;
      setPendingConfirm({ type: 'snooze', card: currentCard });
  };

  const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (autoPreview) return;
      if (!currentCard || !onDeleteCard) return;
      setPendingConfirm({ type: 'delete', card: currentCard });
  };

  const handleConfirmAction = () => {
      if (!pendingConfirm) return;
      const card = pendingConfirm.card;

      if (pendingConfirm.type === 'snooze') {
          const baseSRS = card.srs ? { ...card.srs } : { ...INITIAL_SRS_DATA, dueDate: Date.now() };
          
          const snoozedSRS = {
              ...baseSRS,
              dueDate: Date.now() + (30 * 24 * 60 * 60 * 1000), // +30 days
              interval: 30,
              repetition: (baseSRS.repetition || 0) + 1,
              easeFactor: baseSRS.easeFactor || 2.5
          };
          
          onUpdateCard(card.id, { srs: snoozedSRS });
          setExcludedIds(prev => {
              const next = new Set(prev);
              next.add(card.id);
              return next;
          });
      } else if (pendingConfirm.type === 'delete' && onDeleteCard) {
          const cardId = card.id;
          setExcludedIds(prev => {
              const next = new Set(prev);
              next.add(cardId);
              return next;
          });
          onDeleteCard(cardId);
      }

      // Update local queue for both actions
      setIsFlipped(false);
      const nextQueue = studyQueue.filter(c => c.id !== pendingConfirm.card.id);
      setStudyQueue(nextQueue);
      if (nextQueue.length > 0) {
          setCurrentCard(nextQueue[0]);
      } else {
          setCurrentCard(null);
          setSessionComplete(true);
      }

      setPendingConfirm(null);
  };

  const handleCancelConfirm = () => setPendingConfirm(null);

  const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleResetTimerClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onResetTimer?.();
  };

  useEffect(() => {
    if (!autoPreview) {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      return;
    }

    if (!currentCard || studyQueue.length === 0) return;

    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    let cancelled = false;

    const runAutoDisplay = async () => {
      setIsFlipped(true); // Keep answer visible while speaking

      if (azureRegion && azureKey) {
        try {
          setIsPlaying(true);
          cancelSpeech();
          await playAzureTTS(currentCard.back, azureRegion, azureKey);
        } catch (err) {
          console.error("Auto cloud playback error", err);
        } finally {
          setIsPlaying(false);
        }
      } else {
          setShowVoiceSettings(true);
          setShowAzureSettings(true);
      }

      if (cancelled) return;

      autoTimerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        const currentIndex = studyQueue.findIndex(c => c.id === currentCard.id);
        const nextIndex = currentIndex + 1;

        if (nextIndex < studyQueue.length) {
          setCurrentCard(studyQueue[nextIndex]);
        } else {
          setCurrentCard(null);
          setSessionComplete(true);
        }
        setIsFlipped(false);
      }, 60000);
    };

    runAutoDisplay();

    return () => {
      cancelled = true;
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      cancelSpeech();
    };
  }, [autoPreview, currentCard, studyQueue, azureRegion, azureKey]);

  useEffect(() => {
    if (viewMode !== 'study') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      
      if (e.key === ' ' || e.key === 'Enter') {
          setIsFlipped(p => !p);
      } 
      else if (e.key.toLowerCase() === 'p') {
          currentCard && handlePlayAudio(currentCard.back);
      }
      else if (e.key.toLowerCase() === 'o') {
          currentCard && handleCloudPlay(currentCard.back);
      }
      else if (isFlipped) {
          // SRS shortcuts: 1-4 OR q,w,e,r
          if (e.key === '1' || e.key.toLowerCase() === 'q') handleRate('again');
          else if (e.key === '2' || e.key.toLowerCase() === 'w') handleRate('hard');
          else if (e.key === '3' || e.key.toLowerCase() === 'e') handleRate('good');
          else if (e.key === '4' || e.key.toLowerCase() === 'r') handleRate('easy');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, handlePlayAudio, handleCloudPlay, currentCard, viewMode]);

  const isFrenchLong = currentCard ? currentCard.back.split(' ').length > 4 : false;
  const isDue = currentCard ? isCardDue(currentCard) : false;
  const nextAgain = currentCard ? calculateNextReview(currentCard.srs, 'again') : null;
  const nextHard = currentCard ? calculateNextReview(currentCard.srs, 'hard') : null;
  const nextGood = currentCard ? calculateNextReview(currentCard.srs, 'good') : null;
  const nextEasy = currentCard ? calculateNextReview(currentCard.srs, 'easy') : null;

  return (
    <>
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 relative">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
            <button onClick={() => { cancelSpeech(); onBack(); }} className="flex items-center gap-2 text-slate-400 hover:text-white transition">
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Back</span>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700" title="Today's Study Time">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span className="font-mono text-sm font-bold text-slate-300">{formatTime(todayStudyTime)}</span>
                {onResetTimer && (
                    <button onClick={handleResetTimerClick} className="ml-2 text-slate-600 hover:text-red-400 transition" title="Reset Timer">
                        <RotateCcw className="w-3 h-3" />
                    </button>
                )}
            </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
             <button 
               disabled={autoPreview}
               onClick={() => !autoPreview && setViewMode('study')} 
               className={`p-1.5 rounded-md transition ${viewMode === 'study' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'} ${autoPreview ? 'opacity-50 cursor-not-allowed' : ''}`}
             >
               <Layers className="w-4 h-4" />
             </button>
             <button 
               disabled={autoPreview}
               onClick={() => !autoPreview && setViewMode('gallery')} 
               className={`p-1.5 rounded-md transition ${viewMode === 'gallery' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'} ${autoPreview ? 'opacity-50 cursor-not-allowed' : ''}`}
             >
               <List className="w-4 h-4" />
             </button>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
             <Brain className={`w-4 h-4 ${isDue ? 'text-orange-400' : 'text-green-400'}`} />
             <span className="text-slate-300 text-xs font-mono">{studyQueue.length} Queue</span>
          </div>
          <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-lg transition ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><Settings className="w-5 h-5" /></button>
        </div>
      </div>

      {autoPreview && (
         <div className="mb-3 px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 rounded-lg text-sm text-cyan-100">
            Auto display is running. Cards that are new or due will play with cloud voice and advance every 1 minute without changing progress.
         </div>
      )}

      {showVoiceSettings && (
         <div className="mb-6 space-y-4 bg-slate-800 rounded-xl border border-slate-700 p-4 animate-in fade-in slide-in-from-top-2 shrink-0 max-h-[50vh] overflow-y-auto">
            <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Local Voice</label>
            <div className="flex gap-2">
                <select value={selectedVoiceName} onChange={handleVoiceChange} className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5">
                    {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                </select>
            </div>
            </div>
            <div className="border-t border-slate-700 pt-4">
                 <div className="flex justify-between mb-2">
                     <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2"><CloudLightning className="w-3 h-3" /> Azure Cloud</label>
                     <button onClick={() => setShowAzureSettings(!showAzureSettings)} className="text-xs text-slate-400 underline">Config</button>
                 </div>
                 {showAzureSettings && (
                     <div className="grid grid-cols-2 gap-3 mb-2 bg-slate-900/30 p-2 rounded">
                        <input placeholder="Region" value={azureRegion} onChange={e => setAzureRegion(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" />
                        <input type="password" placeholder="Key" value={azureKey} onChange={e => setAzureKey(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" />
                        <button onClick={handleAzureSave} className="col-span-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1 rounded flex items-center justify-center gap-1"><Save className="w-3 h-3" /> Save Azure</button>
                     </div>
                 )}
            </div>
            <div className="border-t border-slate-700 pt-4">
                <div className="flex justify-between mb-2">
                     <label className="text-xs font-bold text-violet-400 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-3 h-3" /> Google Gemini</label>
                     <button onClick={() => setShowGoogleSettings(!showGoogleSettings)} className="text-xs text-slate-400 underline">Config</button>
                 </div>
                 {showGoogleSettings && (
                     <div className="flex flex-col gap-2 bg-slate-900/30 p-2 rounded">
                        <div className="flex gap-2"><Key className="w-4 h-4 text-slate-500" /><input type="password" placeholder="Gemini API Key" value={googleKey} onChange={e => setGoogleKey(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" /></div>
                        <button onClick={handleGoogleSave} className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs py-1 rounded flex items-center justify-center gap-1"><Save className="w-3 h-3" /> Save Key</button>
                     </div>
                 )}
            </div>
         </div>
      )}

      <div className="text-center mb-4 shrink-0"><h2 className="text-xl font-bold text-white">{title}</h2></div>

      {viewMode === 'gallery' ? (
        <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col shadow-xl">
             <div className="overflow-y-auto p-0 no-scrollbar flex-1">
                 <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-900 sticky top-0 z-10 shadow-lg">
                         <tr>
                             <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                             <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Question</th>
                             <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Answer</th>
                             <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Action</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-700">
                         {cards.map(card => {
                             const status = getCardStatusLabel(card);
                             return (
                                 <tr key={card.id} className="hover:bg-slate-700/50 transition group">
                                     <td className="p-4 align-top w-32">
                                         <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                             status.type === 'new' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                             status.type === 'due' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                             'bg-green-500/10 text-green-400 border-green-500/20'
                                         }`}>
                                             {status.label}
                                         </span>
                                     </td>
                                     <td className="p-4 align-top text-slate-300 font-medium">{card.front}</td>
                                     <td className="p-4 align-top text-white">{card.back}</td>
                                     <td className="p-4 align-top text-right">
                                         <div className="flex justify-end gap-2">
                                            <button onClick={(e) => {e.stopPropagation(); onDeleteCard && onDeleteCard(card.id)}} className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-full transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                            <button onClick={(e) => handlePlayAudio(card.back, e)} className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-700 rounded-full transition"><Volume2 className="w-4 h-4" /></button>
                                         </div>
                                     </td>
                                 </tr>
                             );
                         })}
                     </tbody>
                 </table>
                 {cards.length === 0 && <div className="p-8 text-center text-slate-500">No cards in this unit.</div>}
             </div>
        </div>
      ) : (
        <>
            {(sessionComplete || !currentCard) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95">
                    <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">{autoPreview ? 'Auto display finished' : "You're all caught up!"}</h2>
                    <p className="text-slate-400 mb-8 max-w-md">
                      {autoPreview 
                        ? 'All new or due cards in this set have been previewed. No progress was recorded.'
                        : 'You have reviewed all cards currently due in this queue. Check back later or switch to Gallery Mode to see all words.'}
                    </p>
                    <button onClick={onBack} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition">Back to Dashboard</button>
                </div>
            ) : (
                <>
                <div className="flex-1 flex items-center justify-center min-h-[40vh] perspective-1000 mb-4">
                    <div className={`relative w-full max-w-lg transition-all duration-500 transform-style-3d cursor-pointer group min-h-[50vh] md:h-auto md:aspect-[4/3] ${isFlipped ? 'rotate-y-180' : ''}`} onClick={() => setIsFlipped(prev => !prev)}>
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-slate-800 border-2 border-slate-700 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 group-hover:border-indigo-500/50 transition">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">Question</span>
                        <p className="text-2xl md:text-3xl text-center font-medium text-slate-100 leading-relaxed overflow-y-auto max-h-[70%]">{currentCard.front}</p>
                        <p className="mt-auto md:mt-8 text-sm text-slate-500 animate-pulse pt-4">Tap to reveal answer</p>
                    </div>
                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-900/20 border-2 border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 backdrop-blur-sm">
                        {aiExplanation && (
                            <div className="absolute top-0 left-0 right-0 bg-slate-900/95 p-4 z-10 rounded-t-xl border-b border-indigo-500/30 text-left overflow-y-auto max-h-[160px] animate-in slide-in-from-top-2" onClick={e => e.stopPropagation()}>
                                <p className="text-xs font-bold text-indigo-400 uppercase mb-1">AI Context</p>
                                <div className="text-sm text-slate-200 whitespace-pre-wrap">{aiExplanation}</div>
                            </div>
                        )}
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4 mt-4">Réponse</span>
                        <p className="text-2xl md:text-3xl text-center font-medium text-white leading-relaxed overflow-y-auto max-h-[40%] mb-4">{currentCard.back}</p>
                        
                        <div className="mt-auto flex flex-wrap justify-center gap-3 pt-4 border-t border-white/10 w-full" onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => handlePlayAudio(currentCard.back, e)} disabled={isPlaying} title="Play Local (P)" className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white shadow-lg">{isPlaying && !isFrenchLong ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}</button>
                        <button onClick={(e) => handleCloudPlay(currentCard.back, e)} disabled={isPlaying || !azureKey} title="Play Cloud (O)" className={`p-3 rounded-full shadow-lg ${azureKey ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'}`}>{isPlaying ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CloudLightning className="w-5 h-5" />}</button>
                        <button onClick={handleAiExplain} disabled={isGeneratingAi} className={`p-3 rounded-full shadow-lg transition ${isGeneratingAi ? 'bg-slate-600' : 'bg-violet-600 hover:bg-violet-500'} text-white`} title="Explain with AI">{isGeneratingAi ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}</button>
                        {isFrenchLong && <button onClick={(e) => handlePlaySequence(currentCard.back, e)} disabled={isPlaying} className="p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-white shadow-lg" title="Slow Mode"><Play className="w-5 h-5" /></button>}
                        {!autoPreview && (
                          <div className="w-full flex justify-center gap-4 mt-2 border-t border-white/10 pt-2">
                              <button onClick={handleSnooze} className="text-slate-400 hover:text-indigo-300 text-xs flex items-center gap-1"><Moon className="w-3 h-3" /> Snooze 30d</button>
                              <button onClick={handleDelete} className="text-slate-400 hover:text-red-400 text-xs flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
                          </div>
                        )}
                        </div>
                    </div>
                    </div>
                </div>
                <div className="h-[80px] shrink-0">
                    {autoPreview ? (
                        <div className="h-full flex items-center justify-center text-cyan-100 text-sm bg-cyan-900/10 border border-cyan-500/20 rounded-lg">
                            Auto display will advance after 1 minute per card. Progress is not recorded.
                        </div>
                    ) : isFlipped ? (
                        <div className="grid grid-cols-4 gap-2 md:gap-4 h-full">
                            <button onClick={(e) => handleRate('again', e)} className="flex flex-col items-center justify-center bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 rounded-xl transition" title="Press Q or 1"><span className="text-xs text-red-300 font-bold uppercase mb-1">Again</span><span className="text-xs text-red-200 opacity-60">{nextAgain ? getDueDateLabel(nextAgain.dueDate) : '-'}</span></button>
                            <button onClick={(e) => handleRate('hard', e)} className="flex flex-col items-center justify-center bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 rounded-xl transition" title="Press W or 2"><span className="text-xs text-orange-300 font-bold uppercase mb-1">Hard</span><span className="text-xs text-orange-200 opacity-60">{nextHard ? getDueDateLabel(nextHard.dueDate) : '-'}</span></button>
                            <button onClick={(e) => handleRate('good', e)} className="flex flex-col items-center justify-center bg-green-500/20 hover:bg-green-500/40 border border-green-500/50 rounded-xl transition" title="Press E or 3"><span className="text-xs text-green-300 font-bold uppercase mb-1">Good</span><span className="text-xs text-green-200 opacity-60">{nextGood ? getDueDateLabel(nextGood.dueDate) : '-'}</span></button>
                            <button onClick={(e) => handleRate('easy', e)} className="flex flex-col items-center justify-center bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-500/50 rounded-xl transition" title="Press R or 4"><span className="text-xs text-cyan-300 font-bold uppercase mb-1">Easy</span><span className="text-xs text-cyan-200 opacity-60">{nextEasy ? getDueDateLabel(nextEasy.dueDate) : '-'}</span></button>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm italic">Flip card to rate</div>
                    )}
                </div>
            </>
            )}
        </>
      )}
    </div>
    <ConfirmModal 
      open={!!pendingConfirm}
      title={pendingConfirm?.type === 'delete' ? 'Delete Card' : 'Snooze Card'}
      message={
        pendingConfirm?.type === 'delete'
          ? `Delete "${pendingConfirm.card.front}" permanently?`
          : `Snooze "${pendingConfirm?.card.front}" for 30 days and skip it for now?`
      }
      tone={pendingConfirm?.type === 'delete' ? 'danger' : 'info'}
      confirmLabel={pendingConfirm?.type === 'delete' ? 'Delete' : 'Snooze 30d'}
      onConfirm={handleConfirmAction}
      onCancel={handleCancelConfirm}
    />
    </>
  );
};
