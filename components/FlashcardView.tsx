import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Flashcard, StudyMode } from '../types';
import { getFrenchVoices, speak, cancelSpeech, speakViaLocalService } from '../services/ttsService';
import { playAzureTTS, stopAzureTTS } from '../services/azureService';
import { generateCardContext } from '../services/geminiService';
import { calculateNextReview, getDueDateLabel, isCardDue, getCardStatusLabel, getCardPriority, INITIAL_SRS_DATA } from '../services/srsService';
import { ConfirmModal } from './ConfirmModal';
import { ArrowLeft, RefreshCw, Volume2, Play, Pause, Settings, CloudLightning, Brain, CheckCircle, List, Layers, Sparkles, Loader2, Save, Key, Clock, RotateCcw, Trash2, Moon, Maximize2, Minimize2, Mic, Edit2, X, SkipBack, SkipForward } from 'lucide-react';

interface FlashcardViewProps {
  cards: Flashcard[];
  studyCards?: Flashcard[];
  title: string;
  onBack: () => void;
  unitId: string;
  onUpdateCard: (cardId: string, updates: Partial<Flashcard>) => void;
  onDeleteCard?: (cardId: string) => void;
  onStudyActivity?: () => void; 
  todayStudyTime?: number;
  onResetTimer?: () => void;
  isTimerPaused?: boolean;
  isTimerExpanded?: boolean;
  onToggleTimerPause?: () => void;
  onToggleTimerExpanded?: () => void;
  autoPreview?: boolean;
  studyMode?: StudyMode;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({ 
  cards, studyCards, title, onBack, unitId, onUpdateCard, onDeleteCard, onStudyActivity, todayStudyTime = 0, onResetTimer, isTimerPaused = false, isTimerExpanded = false, onToggleTimerPause, onToggleTimerExpanded, autoPreview = false, studyMode = 'srs'
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<'study' | 'gallery'>('study');
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [pendingConfirm, setPendingConfirm] = useState<{ type: 'snooze' | 'delete'; card: Flashcard } | null>(null);
  const autoTimerRef = useRef<number | null>(null);
  const autoSessionRef = useRef(0); // prevents overlapping auto runs
  const autoRunActiveRef = useRef(false);
  const autoTimeoutsRef = useRef<number[]>([]);
  const autoStartedCardIdRef = useRef<string | null>(null);
  const isSequenceMode = studyMode === 'sequence';
  const isAppleTouchDevice = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  // Queue Init
  useEffect(() => {
    const queueCards = studyCards ?? cards;
    const filtered = queueCards.filter(card => !excludedIds.has(card.id));
    const sorted = isSequenceMode ? [...filtered] : [...filtered].sort((a, b) => {
      const pA = getCardPriority(a);
      const pB = getCardPriority(b);
      if (pA !== pB) return pA - pB;
      const dateA = a.srs?.dueDate || 0;
      const dateB = b.srs?.dueDate || 0;
      return dateA - dateB;
    });
    
    setStudyQueue(sorted);
    
    if (sorted.length > 0) {
      setCurrentCard(previous => {
        if (!previous) return sorted[0];
        return sorted.find(c => c.id === previous.id) || sorted[0];
      });
      setSessionComplete(false);
    } else {
      setSessionComplete(true);
      setCurrentCard(null);
    }
  }, [cards, studyCards, excludedIds, isSequenceMode]); 

  useEffect(() => {
    setExcludedIds(new Set());
  }, [unitId, studyMode]);

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
  const [isClozeMode, setIsClozeMode] = useState(false);
  const [autoPlaybackStarted, setAutoPlaybackStarted] = useState(false);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState(() => {
    const saved = Number(localStorage.getItem('tcf-auto-advance-seconds'));
    return Number.isFinite(saved) && saved >= 5 ? Math.min(600, Math.round(saved)) : 60;
  });
  const [clozeInput, setClozeInput] = useState('');
  const clozeIndexMapRef = useRef<Map<string, number>>(new Map());
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  useEffect(() => {
      setAiExplanation(null);
      setIsGeneratingAi(false);
      setClozeInput('');
  }, [currentCard]);

  useEffect(() => {
    if (!autoPreview) {
      setAutoPlaybackStarted(false);
      autoStartedCardIdRef.current = null;
      return;
    }

    setAutoPlaybackStarted(!isAppleTouchDevice);
  }, [autoPreview, isAppleTouchDevice, unitId]);

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

  const handleAutoAdvanceSecondsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(e.target.value);
      if (!Number.isFinite(parsed)) return;

      const nextSeconds = Math.max(5, Math.min(600, Math.round(parsed)));
      setAutoAdvanceSeconds(nextSeconds);
      localStorage.setItem('tcf-auto-advance-seconds', String(nextSeconds));
  };

  const handleStartAutoPlayback = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!azureRegion || !azureKey) {
          setShowVoiceSettings(true);
          setShowAzureSettings(true);
          return;
      }
      if (!currentCard) return;

      try {
          setIsPlaying(true);
          setIsFlipped(true);
          cancelSpeech();
          stopAzureTTS({ silent: true });
          await Promise.race([
            playAzureTTS(currentCard.back, azureRegion, azureKey, { resolveOnStart: true }),
            new Promise<void>((_, reject) => {
              window.setTimeout(() => reject(new Error("Auto playback start timed out")), 25000);
            })
          ]);
          autoStartedCardIdRef.current = currentCard.id;
          setAutoPlaybackStarted(true);
      } catch (err) {
          autoStartedCardIdRef.current = null;
          console.error("Auto pronunciation start failed", err);
          alert("Auto pronunciation could not start. Try the read button once, then start Auto again.");
      } finally {
          setIsPlaying(false);
      }
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

  const handleListPlayAudio = useCallback(async (text: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isPlaying) return;

      try {
          setIsPlaying(true);
          cancelSpeech();
          stopAzureTTS({ silent: true });

          if (azureRegion && azureKey) {
              try {
                  await playAzureTTS(text, azureRegion, azureKey);
                  return;
              } catch (err) {
                  console.error("List Azure playback error; falling back to local voice", err);
              }
          }

          await speak(text, getSelectedVoice());
      } catch (err) {
          console.error("List playback error", err);
      } finally {
          setIsPlaying(false);
      }
  }, [isPlaying, azureRegion, azureKey, getSelectedVoice]);

  const handleLocalProxyPlay = useCallback(async (text: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isPlaying) return;
      try {
          setIsPlaying(true);
          cancelSpeech();
          stopAzureTTS({ silent: true });
          await speakViaLocalService(text);
      } catch (err) {
          console.error("Local proxy playback error", err);
          alert("Local TTS failed. Check the Siri proxy service.");
      } finally {
          setIsPlaying(false);
      }
  }, [isPlaying]);

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
    if (autoPreview || isSequenceMode) return;
    if (!currentCard) return;
    onStudyActivity?.();
    const newSRS = calculateNextReview(currentCard.srs, grade);
    const isRequeue = !studyCards && newSRS.interval === 0;
    if (!isRequeue) {
      setExcludedIds(prev => {
        const next = new Set(prev);
        next.add(currentCard.id);
        return next;
      });
    }
    onUpdateCard(currentCard.id, { srs: newSRS });
    cancelSpeech();
    setIsFlipped(false);
    setTimeout(() => {
      const currentIndex = studyQueue.findIndex(c => c.id === currentCard.id);
      if (currentIndex !== -1) {
          const nextQueue = [...studyQueue];
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
      if (autoPreview || isSequenceMode) return;
      if (!currentCard) return;
      setPendingConfirm({ type: 'snooze', card: currentCard });
  };

  const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (autoPreview || isSequenceMode) return;
      if (!currentCard || !onDeleteCard) return;
      setPendingConfirm({ type: 'delete', card: currentCard });
  };

  const handleDeleteFromList = (card: Flashcard, e: React.MouseEvent) => {
      e.stopPropagation();
      if (autoPreview || isSequenceMode) return;
      if (!onDeleteCard) return;
      setPendingConfirm({ type: 'delete', card });
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

  const handleEditOpen = (card: Flashcard, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingCard(card);
    setEditFront(card.front);
    setEditBack(card.back);
  };

  const handleEditSave = () => {
    if (!editingCard) return;
    const updates = { front: editFront.trim(), back: editBack.trim() };
    onUpdateCard(editingCard.id, updates);
    setStudyQueue(prev => prev.map(card => card.id === editingCard.id ? { ...card, ...updates } : card));
    setCurrentCard(prev => prev?.id === editingCard.id ? { ...prev, ...updates } : prev);
    clozeIndexMapRef.current.delete(editingCard.id);
    setClozeInput('');
    setAiExplanation(null);
    setEditingCard(null);
  };

  const handleClozeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    (e.target as HTMLInputElement).blur();
    containerRef.current?.focus();
  };

  const formatTime = (seconds: number, showSeconds = false) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (showSeconds) {
          if (h > 0) return `${h}h ${m}m ${s}s`;
          return `${m}m ${s}s`;
      }
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleResetTimerClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onResetTimer?.();
  };

  const moveSequenceToIndex = useCallback((nextIndex: number) => {
    cancelSpeech();
    stopAzureTTS({ silent: true });
    setIsPlaying(false);
    setIsFlipped(false);

    if (nextIndex < 0) {
      setCurrentCard(studyQueue[0] || null);
      setSessionComplete(studyQueue.length === 0);
      return;
    }

    if (nextIndex >= studyQueue.length) {
      setCurrentCard(null);
      setSessionComplete(true);
      return;
    }

    setCurrentCard(studyQueue[nextIndex]);
    setSessionComplete(false);
  }, [studyQueue]);

  const currentSequenceIndex = currentCard ? studyQueue.findIndex(card => card.id === currentCard.id) : -1;
  const isFirstSequenceCard = currentSequenceIndex <= 0;
  const isLastSequenceCard = currentSequenceIndex === studyQueue.length - 1;

  const handleSequencePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isSequenceMode || studyQueue.length === 0) return;
    if (sessionComplete) {
      moveSequenceToIndex(studyQueue.length - 1);
      return;
    }
    moveSequenceToIndex(Math.max(0, currentSequenceIndex - 1));
  }, [currentSequenceIndex, isSequenceMode, moveSequenceToIndex, sessionComplete, studyQueue.length]);

  const handleSequenceNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isSequenceMode || studyQueue.length === 0) return;
    if (sessionComplete) {
      moveSequenceToIndex(0);
      return;
    }
    moveSequenceToIndex(currentSequenceIndex + 1);
  }, [currentSequenceIndex, isSequenceMode, moveSequenceToIndex, sessionComplete, studyQueue.length]);

  const handleSequenceRestart = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isSequenceMode || studyQueue.length === 0) return;
    moveSequenceToIndex(0);
  }, [isSequenceMode, moveSequenceToIndex, studyQueue.length]);

  useEffect(() => {
    if (!autoPreview) {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      autoSessionRef.current += 1;
      autoRunActiveRef.current = false;
      return;
    }

    if (!currentCard || studyQueue.length === 0) return;

    if (!autoPlaybackStarted) {
      setIsFlipped(true);
      autoRunActiveRef.current = false;
      return;
    }

    if (autoRunActiveRef.current) return;
    autoRunActiveRef.current = true;

    const sessionId = autoSessionRef.current + 1;
    autoSessionRef.current = sessionId;

    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    const clearAutoTimers = () => {
      autoTimeoutsRef.current.forEach(id => {
        clearTimeout(id);
        clearInterval(id);
      });
      autoTimeoutsRef.current = [];
    };

    // Clear any lingering timers before starting new run
    clearAutoTimers();

    let cancelled = false;
    let advanced = false;

    const runAutoDisplay = () => {
      setIsFlipped(true); // Keep answer visible while speaking

      if (!azureRegion || !azureKey) {
          setShowVoiceSettings(true);
          setShowAzureSettings(true);
          autoRunActiveRef.current = false;
          return;
      }

      const schedule = (delay: number, fn: () => void) => {
        const id = window.setTimeout(fn, delay);
        autoTimeoutsRef.current.push(id);
      };

      const playOnce = async () => {
        if (cancelled || sessionId !== autoSessionRef.current) return;
        try {
          setIsPlaying(true);
          cancelSpeech();
          stopAzureTTS({ silent: true });
          await Promise.race([
            playAzureTTS(currentCard.back, azureRegion, azureKey),
            new Promise<void>((_, reject) => {
              window.setTimeout(() => reject(new Error("Auto playback timed out")), 25000);
            })
          ]);
        } catch (err) {
          if ((err as DOMException)?.name !== 'AbortError') {
            console.error("Auto cloud playback error", err);
          }
        } finally {
          setIsPlaying(false);
        }
      };

      const autoAdvanceMs = autoAdvanceSeconds * 1000;
      const advanceAt = Date.now() + autoAdvanceMs;
      const advanceIfReady = (force = false) => {
        if (advanced || cancelled || sessionId !== autoSessionRef.current) {
          autoRunActiveRef.current = false;
          return;
        }
        if (!force && Date.now() < advanceAt) return;

        advanced = true;
        clearAutoTimers();
        stopAzureTTS({ silent: true });
        const currentIndex = studyQueue.findIndex(c => c.id === currentCard.id);
        const nextIndex = currentIndex + 1;

        if (nextIndex < studyQueue.length) {
          setCurrentCard(studyQueue[nextIndex]);
        } else {
          setCurrentCard(null);
          setSessionComplete(true);
        }
        setIsFlipped(false);
        setIsPlaying(false);
        autoRunActiveRef.current = false;
      };

      // Two plays: immediately and after 10s. On iPhone/iPad the first play can come directly
      // from the Start button tap, so do not schedule a duplicate immediate playback for that card.
      if (autoStartedCardIdRef.current !== currentCard.id) {
        schedule(0, playOnce);
      }
      if (autoAdvanceMs > 10000) {
        schedule(10000, playOnce);
      }

      // Advance after the selected interval. The interval and page events make this more reliable on iPad/Safari,
      // where long timers can be delayed when the page is throttled.
      schedule(autoAdvanceMs, () => advanceIfReady(true));
      const watchdogId = window.setInterval(() => advanceIfReady(), 1000);
      autoTimeoutsRef.current.push(watchdogId);
      const handlePageResume = () => advanceIfReady();
      document.addEventListener('visibilitychange', handlePageResume);
      window.addEventListener('focus', handlePageResume);
      window.addEventListener('pageshow', handlePageResume);

      return () => {
        document.removeEventListener('visibilitychange', handlePageResume);
        window.removeEventListener('focus', handlePageResume);
        window.removeEventListener('pageshow', handlePageResume);
      };
    };

    const cleanupAutoDisplay = runAutoDisplay();

    return () => {
      cancelled = true;
      autoSessionRef.current += 1; // invalidate any pending run
      cleanupAutoDisplay?.();
      clearAutoTimers();
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      cancelSpeech();
      stopAzureTTS({ silent: true });
      autoRunActiveRef.current = false;
    };
  }, [autoPreview, autoPlaybackStarted, currentCard?.id, azureRegion, azureKey]);

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
      else if (e.key.toLowerCase() === 'i') {
          currentCard && handleLocalProxyPlay(currentCard.back);
      }
      else if (isSequenceMode) {
          if ((e.key === 'ArrowLeft' || e.key.toLowerCase() === 'b') && (isFlipped || sessionComplete)) {
            e.preventDefault();
            handleSequencePrev();
          } else if ((e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') && (isFlipped || sessionComplete)) {
            e.preventDefault();
            handleSequenceNext();
          }
      } else if (isFlipped) {
          // SRS shortcuts: 1-4 OR q,w,e,r
          if (e.key === '1' || e.key.toLowerCase() === 'q') handleRate('again');
          else if (e.key === '2' || e.key.toLowerCase() === 'w') handleRate('hard');
          else if (e.key === '3' || e.key.toLowerCase() === 'e') handleRate('good');
          else if (e.key === '4' || e.key.toLowerCase() === 'r') handleRate('easy');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCard, handleCloudPlay, handleLocalProxyPlay, handlePlayAudio, handleRate, handleSequenceNext, handleSequencePrev, isFlipped, isSequenceMode, sessionComplete, viewMode]);

  const isFrenchLong = currentCard ? currentCard.back.split(' ').length > 4 : false;
  const isDue = currentCard ? isCardDue(currentCard) : false;
  const queueBadgeLabel = isSequenceMode ? `${studyQueue.length} Steps` : `${studyQueue.length} Queue`;
  const canEditCurrentCard = !isSequenceMode && !!currentCard;
  const nextAgain = currentCard ? calculateNextReview(currentCard.srs, 'again') : null;
  const nextHard = currentCard ? calculateNextReview(currentCard.srs, 'hard') : null;
  const nextGood = currentCard ? calculateNextReview(currentCard.srs, 'good') : null;
  const nextEasy = currentCard ? calculateNextReview(currentCard.srs, 'easy') : null;

  const normalizeClozeWord = (value: string) =>
    value.toLowerCase().replace(/[.,!?;:()"']/g, '').trim();

  const getClozeIndex = (cardId: string, words: string[]) => {
    const existing = clozeIndexMapRef.current.get(cardId);
    if (existing !== undefined && existing < words.length) return existing;
    const nextIndex = words.length > 0 ? Math.floor(Math.random() * words.length) : 0;
    clozeIndexMapRef.current.set(cardId, nextIndex);
    return nextIndex;
  };

  return (
    <>
    <div ref={containerRef} tabIndex={-1} className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 relative focus:outline-none">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
            <button onClick={() => { cancelSpeech(); onBack(); }} className="flex items-center gap-2 text-slate-400 hover:text-white transition">
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Back</span>
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700" title="Today's Study Time">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span className={`font-mono text-sm font-bold ${isTimerPaused ? 'text-slate-500' : 'text-slate-300'}`}>
                  {formatTime(todayStudyTime, isTimerExpanded)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleTimerExpanded?.(); }}
                  className="text-slate-500 hover:text-slate-200 transition"
                  title={isTimerExpanded ? 'Hide seconds' : 'Show seconds'}
                >
                  {isTimerExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleTimerPause?.(); }}
                  className="text-slate-500 hover:text-slate-200 transition"
                  title={isTimerPaused ? 'Resume timer' : 'Pause timer'}
                >
                  {isTimerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
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
             <Brain className={`w-4 h-4 ${isSequenceMode ? 'text-amber-300' : isDue ? 'text-orange-400' : 'text-green-400'}`} />
             <span className="text-slate-300 text-xs font-mono">{queueBadgeLabel}</span>
          </div>
          <button
            onClick={() => setIsClozeMode(prev => !prev)}
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border transition ${isClozeMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
            title="Cloze mode (fill the missing word)"
          >
            Cloze
          </button>
          <div className="relative">
            <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-lg transition ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><Settings className="w-5 h-5" /></button>
            {showVoiceSettings && (
               <div className="absolute right-0 mt-2 w-[90vw] max-w-sm md:w-96 space-y-4 bg-slate-800 rounded-xl border border-slate-700 p-4 animate-in fade-in slide-in-from-top-2 z-20 max-h-[60vh] overflow-y-auto shadow-2xl">
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
          </div>
        </div>
      </div>

      {autoPreview && (
         <div className="mb-3 px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 rounded-lg text-sm text-cyan-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col gap-2">
              <span>
                {autoPlaybackStarted
                  ? `Auto display is running. Cards advance every ${autoAdvanceSeconds}s without changing progress.`
                  : 'Tap Start Auto Pronunciation to allow audio playback on iPhone/iPad.'}
              </span>
              <label className="flex items-center gap-2 text-xs text-cyan-100/90" onClick={(e) => e.stopPropagation()}>
                <span className="font-bold uppercase tracking-wider">Advance</span>
                <input
                  type="number"
                  min={5}
                  max={600}
                  step={1}
                  value={autoAdvanceSeconds}
                  onChange={handleAutoAdvanceSecondsChange}
                  className="w-20 bg-slate-950/70 border border-cyan-500/30 rounded px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <span>seconds</span>
              </label>
            </div>
            {!autoPlaybackStarted && (
              <button
                onClick={handleStartAutoPlayback}
                disabled={isPlaying}
                className="shrink-0 inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg font-semibold transition"
              >
                {isPlaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Auto Pronunciation
              </button>
            )}
         </div>
      )}

      {isSequenceMode && !autoPreview && (
         <div className="mb-3 px-4 py-2 bg-amber-900/30 border border-amber-500/30 rounded-lg text-sm text-amber-100">
            Sequence mode keeps the article in fixed order for structured speaking practice. It does not use SRS and does not modify your saved cards.
         </div>
      )}

      <div className="text-center mb-4 shrink-0"><h2 className="text-xl font-bold text-white">{title}</h2></div>

      {viewMode === 'gallery' ? (
        <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col shadow-xl">
             <div className="overflow-y-auto p-0 no-scrollbar flex-1">
                 <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-900 sticky top-0 z-10 shadow-lg">
                         <tr>
                             <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{isSequenceMode ? 'Step' : 'Status'}</th>
                             <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Question</th>
                             <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Answer</th>
                             <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Action</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-700">
                         {cards.map((card, index) => {
                             const status = getCardStatusLabel(card);
                             return (
                                 <tr key={card.id} className="hover:bg-slate-700/50 transition group">
                                     <td className="p-4 align-top w-32">
                                         {isSequenceMode ? (
                                           <span className="inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border bg-amber-500/10 text-amber-300 border-amber-500/20">
                                             {index + 1} / {cards.length}
                                           </span>
                                         ) : (
                                           <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${
                                               status.type === 'new' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                               status.type === 'due' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                               'bg-green-500/10 text-green-400 border-green-500/20'
                                           }`}>
                                               {status.label}
                                           </span>
                                         )}
                                     </td>
                                     <td className="p-4 align-top text-slate-300 font-medium">{card.front}</td>
                                     <td className="p-4 align-top text-white">{card.back}</td>
                                     <td className="p-4 align-top text-right">
                                         <div className="flex justify-end gap-2">
                                            {!isSequenceMode && (
                                              <button onClick={(e) => handleEditOpen(card, e)} className="p-2 text-slate-500 hover:text-indigo-300 hover:bg-slate-700 rounded-full transition" title="Edit"><Edit2 className="w-4 h-4" /></button>
                                            )}
                                            {!isSequenceMode && (
                                              <button onClick={(e) => handleDeleteFromList(card, e)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-full transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                            <button onClick={(e) => handleListPlayAudio(card.back, e)} className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-700 rounded-full transition" title={azureRegion && azureKey ? 'Play Azure voice' : 'Play local voice'}><Volume2 className="w-4 h-4" /></button>
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
                    <h2 className="text-2xl font-bold text-white mb-2">
                      {autoPreview ? 'Auto display finished' : isSequenceMode ? 'Sequence complete' : "You're all caught up!"}
                    </h2>
                    <p className="text-slate-400 mb-8 max-w-md">
                      {autoPreview 
                        ? 'All new or due cards in this set have been previewed. No progress was recorded.'
                        : isSequenceMode
                          ? 'You reached the end of the article in order. Restart the sequence to rehearse the structure again, or go back to the article view.'
                          : 'You have reviewed all cards currently due in this queue. Check back later or switch to Gallery Mode to see all words.'}
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {isSequenceMode && (
                        <button
                          onClick={handleSequenceRestart}
                          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-100 border border-amber-500/30 px-6 py-3 rounded-lg font-medium transition"
                        >
                          Restart Sequence
                        </button>
                      )}
                      <button onClick={onBack} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition">
                        {isSequenceMode ? 'Back to Article' : 'Back to Dashboard'}
                      </button>
                    </div>
                </div>
            ) : (
                <>
                <div className="flex-1 flex items-center justify-center min-h-[40vh] perspective-1000 mb-4">
                    <div className={`relative w-full max-w-3xl transition-all duration-500 transform-style-3d cursor-pointer group min-h-[60vh] md:min-h-[70vh] ${isFlipped ? 'rotate-y-180' : ''}`} onClick={() => setIsFlipped(prev => !prev)}>
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-slate-800 border-2 border-slate-700 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 group-hover:border-indigo-500/50 transition">
                        {canEditCurrentCard && (
                          <button
                            onClick={(e) => handleEditOpen(currentCard, e)}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-indigo-200 hover:bg-slate-700 rounded-full transition"
                            title="Edit card"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">{isSequenceMode ? `Sentence ${currentSequenceIndex + 1} of ${studyQueue.length}` : 'Question'}</span>
                        <p className="text-2xl md:text-3xl text-center font-medium text-slate-100 leading-relaxed">{currentCard.front}</p>
                        <p className="mt-auto md:mt-8 text-sm text-slate-500 animate-pulse pt-4">Tap to reveal answer</p>
                    </div>
                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-900/20 border-2 border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 backdrop-blur-sm">
                        {canEditCurrentCard && (
                          <button
                            onClick={(e) => handleEditOpen(currentCard, e)}
                            className="absolute top-4 right-4 z-10 p-2 text-slate-300 hover:text-indigo-100 hover:bg-indigo-500/20 rounded-full transition"
                            title="Edit card"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        <div className="w-full h-full flex flex-col">
                            {aiExplanation && (
                                <div className="bg-slate-900/95 p-4 rounded-xl border border-indigo-500/30 text-left animate-in slide-in-from-top-2" onClick={e => e.stopPropagation()}>
                                    <p className="text-xs font-bold text-indigo-400 uppercase mb-1">AI Context</p>
                                    <div className="text-sm text-slate-200 whitespace-pre-wrap">{aiExplanation}</div>
                                </div>
                            )}
                            <div className={`flex-1 w-full flex flex-col items-center ${aiExplanation ? 'mt-4' : ''}`}>
                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">{isSequenceMode ? `Check Sentence ${currentSequenceIndex + 1}` : 'Réponse'}</span>
                                {isClozeMode ? (() => {
                                  const words = currentCard.back.split(' ').filter(Boolean);
                                  const clozeIndex = getClozeIndex(currentCard.id, words);
                                  const clozeWord = words[clozeIndex] || '';
                                  const display = words.map((word, idx) => (idx === clozeIndex ? '____' : word)).join(' ');
                                  const isCorrect = normalizeClozeWord(clozeInput) === normalizeClozeWord(clozeWord);
                                  return (
                                    <div className="w-full flex flex-col items-center gap-4 mb-4">
                                      <div className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Fill in the blank</p>
                                        <p className="text-2xl md:text-3xl text-center font-medium text-white leading-relaxed">{display}</p>
                                      </div>
                                      <div className="w-full max-w-sm">
                                        <input
                                          value={clozeInput}
                                          onChange={(e) => setClozeInput(e.target.value)}
                                          className={`w-full bg-slate-900 border rounded-lg px-3 py-2.5 text-center text-white focus:outline-none ${isCorrect ? 'border-emerald-500/60' : 'border-slate-700'}`}
                                          placeholder="Type the missing word"
                                          onKeyDown={handleClozeInputKeyDown}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        {clozeInput && (
                                          <div className={`mt-2 text-center text-xs font-bold uppercase tracking-widest ${isCorrect ? 'text-emerald-300' : 'text-slate-400'}`}>
                                            {isCorrect ? 'Correct' : 'Keep trying'}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })() : (
                                  <p className="text-2xl md:text-3xl text-center font-medium text-white leading-relaxed mb-4">{currentCard.back}</p>
                                )}
                                
                                <div className="mt-auto flex flex-wrap justify-center gap-3 pt-4 border-t border-white/10 w-full" onClick={(e) => e.stopPropagation()}>
                                <button onClick={(e) => handlePlayAudio(currentCard.back, e)} disabled={isPlaying} title="Play Local (P)" className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white shadow-lg">{isPlaying && !isFrenchLong ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}</button>
                                <button onClick={(e) => handleCloudPlay(currentCard.back, e)} disabled={isPlaying || !azureKey} title="Play Cloud (O)" className={`p-3 rounded-full shadow-lg ${azureKey ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'}`}>{isPlaying ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CloudLightning className="w-5 h-5" />}</button>
                                <button onClick={(e) => handleLocalProxyPlay(currentCard.back, e)} disabled={isPlaying} title="Play Siri Proxy (I)" className="p-3 rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white">{isPlaying ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}</button>
                                <button onClick={handleAiExplain} disabled={isGeneratingAi} className={`p-3 rounded-full shadow-lg transition ${isGeneratingAi ? 'bg-slate-600' : 'bg-violet-600 hover:bg-violet-500'} text-white`} title="Explain with AI">{isGeneratingAi ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}</button>
                                {isFrenchLong && <button onClick={(e) => handlePlaySequence(currentCard.back, e)} disabled={isPlaying} className="p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-white shadow-lg" title="Slow Mode"><Play className="w-5 h-5" /></button>}
                                {!autoPreview && !isSequenceMode && (
                                  <div className="w-full flex justify-center gap-4 mt-2 border-t border-white/10 pt-2">
                                      <button onClick={handleSnooze} className="text-slate-400 hover:text-indigo-300 text-xs flex items-center gap-1"><Moon className="w-3 h-3" /> Snooze 30d</button>
                                      <button onClick={handleDelete} className="text-slate-400 hover:text-red-400 text-xs flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
                                  </div>
                                )}
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
                <div className="h-[80px] shrink-0">
                    {autoPreview ? (
                        <div className="h-full flex items-center justify-center text-cyan-100 text-sm bg-cyan-900/10 border border-cyan-500/20 rounded-lg">
                            Auto display will advance after 1 minute per card. Progress is not recorded.
                        </div>
                    ) : isSequenceMode ? (
                        <div className="grid grid-cols-3 gap-2 md:gap-4 h-full">
                            <button
                              onClick={handleSequencePrev}
                              disabled={studyQueue.length === 0 || (!sessionComplete && isFirstSequenceCard)}
                              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition disabled:opacity-40 disabled:hover:bg-slate-800"
                              title="Previous sentence (Left / B)"
                            >
                              <SkipBack className="w-4 h-4" />
                              <span className="text-xs text-slate-200 font-bold uppercase">Previous</span>
                            </button>
                            <button
                              onClick={handleSequenceRestart}
                              disabled={studyQueue.length === 0}
                              className="flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition disabled:opacity-40"
                              title="Restart sequence"
                            >
                              <RotateCcw className="w-4 h-4 text-amber-300" />
                              <span className="text-xs text-amber-200 font-bold uppercase">Restart</span>
                            </button>
                            <button
                              onClick={handleSequenceNext}
                              disabled={studyQueue.length === 0 || !isFlipped}
                              className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50 rounded-xl transition disabled:opacity-40 disabled:hover:bg-indigo-600"
                              title="Next sentence (Right / N)"
                            >
                              <span className="text-xs text-white font-bold uppercase">{isLastSequenceCard ? 'Finish' : 'Next'}</span>
                              <SkipForward className="w-4 h-4 text-white" />
                            </button>
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
    {editingCard && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-xl border border-slate-700 flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-slate-700">
            <h3 className="text-lg font-bold text-white">Edit Card</h3>
            <button onClick={() => setEditingCard(null)} className="text-slate-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Front</label>
              <textarea
                value={editFront}
                onChange={(e) => setEditFront(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Back</label>
              <textarea
                value={editBack}
                onChange={(e) => setEditBack(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                rows={3}
              />
            </div>
          </div>
          <div className="p-5 border-t border-slate-700 flex justify-end gap-3">
            <button onClick={() => setEditingCard(null)} className="px-4 py-2 text-slate-300 hover:text-white transition">Cancel</button>
            <button onClick={handleEditSave} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition">Save</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
