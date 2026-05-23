import React, { useState, useEffect, useRef } from 'react';
import { AppData, Category, Flashcard, ImportItem, LongArticle, ViewState } from './types';
import { ImportModal } from './components/ImportModal';
import { FlashcardView } from './components/FlashcardView';
import { LongArticleModal } from './components/LongArticleModal';
import { LongArticleView } from './components/LongArticleView';
import { SyncModal } from './components/SyncModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Plus, BookOpen, ChevronRight, Layers, Trash2, Cloud, Loader2, CheckCircle, CloudOff, Brain, Download, Bell, BellOff, Flame, Play, Pause, Maximize2, Minimize2, Clock, FileText, Edit2 } from 'lucide-react';
import { initSupabase, syncData, pullData, pushData, consolidateData, saveStudyLog, fetchTodayStudyLog, fetchLongArticles, upsertLongArticle, upsertLongArticles, deleteLongArticle } from './services/syncService';
import { isCardDue } from './services/srsService';
import { splitIntoSentences } from './services/textSegmentation';

// Simple UUID generator
const generateId = () => Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);

const mergeLongArticles = (base: LongArticle[], incoming: LongArticle[]) => {
  const map = new Map<string, LongArticle>();
  base.forEach(article => map.set(article.id, article));
  incoming.forEach(article => {
    const existing = map.get(article.id);
    if (!existing || (article.updatedAt || 0) >= (existing.updatedAt || 0)) {
      map.set(article.id, article);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
};

const buildArticleSequenceCards = (article: LongArticle): Flashcard[] => {
  const sentences = splitIntoSentences(article.content);

  return sentences.map((sentence, index) => {
    const isFirst = index === 0;
    const previousSentence = sentences[index - 1];
    const prompt = isFirst
      ? `Opening sentence\n\nStart your response for "${article.title}". What is the first sentence?`
      : `Sentence ${index + 1} of ${sentences.length}\n\nPrevious sentence:\n${previousSentence}\n\nWhat comes next?`;

    return {
      id: `article-sequence-${article.id}-${String(index + 1).padStart(4, '0')}`,
      front: prompt,
      back: sentence,
      mastered: false
    };
  });
};

export default function App() {
  const [data, setData] = useState<AppData>([]);
  const [viewState, setViewState] = useState<ViewState>(ViewState.HOME);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [longArticles, setLongArticles] = useState<LongArticle[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  
  // Modals
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<LongArticle | null>(null);

  // Sync Status
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<AppData | null>(null);

  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [lastNotificationTime, setLastNotificationTime] = useState(0);

  // Streak & Timer
  const [streak, setStreak] = useState(0);
  const [todayStudyTime, setTodayStudyTime] = useState(0); // seconds
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [isTimerExpanded, setIsTimerExpanded] = useState(false);
  type ConfirmState = 
    | { type: 'resetTimer' }
    | { type: 'deleteUnit'; catIdx: number; unitIdx: number; unitName: string }
    | { type: 'fixDuplicates' }
    | { type: 'deleteArticle'; articleId: string; title: string };
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // --- TIMER LOGIC ---
  useEffect(() => {
      const today = new Date().toDateString();
      const savedDate = localStorage.getItem('tcf-study-date');
      let initialTime = 0;

      if (savedDate === today) {
          initialTime = parseInt(localStorage.getItem('tcf-study-time') || '0', 10);
      } else {
          localStorage.setItem('tcf-study-date', today);
          localStorage.setItem('tcf-study-time', '0');
      }
      setTodayStudyTime(initialTime);
  }, []);

  useEffect(() => {
      const interval = setInterval(() => {
          if (document.visibilityState === 'visible' && !isTimerPaused) {
              setTodayStudyTime(prev => {
                  const newVal = prev + 1;
                  if (newVal % 10 === 0) { 
                      localStorage.setItem('tcf-study-time', newVal.toString());
                  }
                  if (newVal % 60 === 0) { 
                      const dateKey = new Date().toISOString().split('T')[0];
                      saveStudyLog(dateKey, newVal);
                  }
                  return newVal;
              });
          }
      }, 1000);

      return () => clearInterval(interval);
  }, [isTimerPaused]);

  // Fetch Cloud Timer on Connect
  useEffect(() => {
      if (isConnected) {
          const dateKey = new Date().toISOString().split('T')[0];
          fetchTodayStudyLog(dateKey).then(cloudTime => {
              setTodayStudyTime(prev => {
                  const maxTime = Math.max(prev, cloudTime);
                  if (maxTime > prev) {
                      localStorage.setItem('tcf-study-time', maxTime.toString());
                  }
                  return maxTime;
              });
          });
      }
  }, [isConnected]);

  const performResetTimer = () => {
      setTodayStudyTime(0);
      localStorage.setItem('tcf-study-time', '0');
      const dateKey = new Date().toISOString().split('T')[0];
      saveStudyLog(dateKey, 0);
  };

  const handleResetTimer = () => {
      setConfirmState({ type: 'resetTimer' });
  };

  const formatTime = (seconds: number, showSeconds = false) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (showSeconds) {
          if (h > 0) return `${h}h ${m}m ${s}s`;
          return `${m}m ${s}s`;
      }
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
  };

  const toggleTimerPause = () => setIsTimerPaused(prev => !prev);
  const toggleTimerExpanded = () => setIsTimerExpanded(prev => !prev);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
    const savedStreak = parseInt(localStorage.getItem('tcf-streak') || '0', 10);
    const lastDate = localStorage.getItem('tcf-last-study-date');
    
    if (lastDate) {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (lastDate === today || lastDate === yesterday) {
            setStreak(savedStreak);
        } else {
            setStreak(0);
            localStorage.setItem('tcf-streak', '0');
        }
    } else {
        setStreak(0);
    }
  }, []);

  const handleStudyActivity = () => {
      const today = new Date().toDateString();
      const lastDate = localStorage.getItem('tcf-last-study-date');

      if (lastDate !== today) {
          let newStreak = 1;
          const yesterday = new Date(Date.now() - 86400000).toDateString();
          if (lastDate === yesterday) {
              const current = parseInt(localStorage.getItem('tcf-streak') || '0', 10);
              newStreak = current + 1;
          }
          
          setStreak(newStreak);
          localStorage.setItem('tcf-streak', newStreak.toString());
          localStorage.setItem('tcf-last-study-date', today);
      }
  };

  const handleNotificationToggle = async () => {
    if (!('Notification' in window)) {
      alert("This browser does not support desktop notifications");
      return;
    }

    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }

    try {
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
        new Notification("Study Reminders Active", { body: "We'll let you know when cards are due." });
      } else if (Notification.permission === 'denied') {
        alert("Notifications are blocked by your browser. Please click the lock icon in the URL bar to allow notifications for this site.");
      } else {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setNotificationsEnabled(true);
          new Notification("Study Reminders Enabled", { body: "We will notify you when cards are due!" });
        }
      }
    } catch (error) {
      console.error("Notification Error:", error);
      alert("Could not enable notifications. You might be in a restricted environment (Incognito or Sandbox).");
    }
  };

  // Notification Polling
  useEffect(() => {
    if (!notificationsEnabled) return;

    const checkDue = () => {
      const now = Date.now();
      if (now - lastNotificationTime < 60 * 60 * 1000) return;

      let totalDue = 0;
      data.forEach(cat => cat.units.forEach(u => {
         totalDue += u.cards.filter(c => isCardDue(c)).length;
      }));

      if (totalDue > 0) {
        if (Notification.permission === 'granted') {
            new Notification("TCF Prep Reminder", {
                body: `You have ${totalDue} cards due for review. Keep up the streak!`,
                icon: '/favicon.ico'
            });
            setLastNotificationTime(now);
        }
      }
    };

    const interval = setInterval(checkDue, 5 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [notificationsEnabled, data, lastNotificationTime]);

  // Persistence Loading & Auto-Sync
  useEffect(() => {
    const saved = localStorage.getItem('tcf-cards-data');
    let localData: AppData = [];
    
    if (saved) {
      try {
        localData = JSON.parse(saved);
        setData(localData);
      } catch (e) {
        console.error("Failed to load local data", e);
      }
    } else {
        localData = [
            { id: generateId(), name: "Compréhension Orale", units: [] },
            { id: generateId(), name: "Expression Orale", units: [] },
            { id: generateId(), name: "Compréhension Écrite", units: [] },
            { id: generateId(), name: "Expression Écrite", units: [] }
        ];
        setData(localData);
    }

    const savedConfig = localStorage.getItem('tcf-supabase-config');
    if (savedConfig) {
      try {
        const { url, key } = JSON.parse(savedConfig);
        if (initSupabase({ url, key })) {
             setIsConnected(true);
             setSyncStatus('syncing');
             pullData(localData).then((result) => {
                 if (result.success && result.data) {
                     setData(result.data);
                     setSyncStatus('saved');
                     reconcileLongArticlesWithCloud();
                 } else {
                     setSyncStatus('idle');
                 }
             });
        }
      } catch (e) {
        console.error("Auto-sync config error", e);
      }
    }
  }, []);

  useEffect(() => {
    const savedArticles = localStorage.getItem('tcf-long-articles');
    if (savedArticles) {
      try {
        const parsed = JSON.parse(savedArticles);
        if (Array.isArray(parsed)) {
          setLongArticles(prev => mergeLongArticles(prev, parsed));
        }
      } catch (e) {
        console.error("Failed to load long articles", e);
      }
    }
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      localStorage.setItem('tcf-cards-data', JSON.stringify(data));
    }
  }, [data]);

  useEffect(() => {
    localStorage.setItem('tcf-long-articles', JSON.stringify(longArticles));
  }, [longArticles]);

  const runCloudSave = async (dataToSave: AppData) => {
    if (saveInFlightRef.current) {
      pendingSaveRef.current = dataToSave;
      return;
    }

    saveInFlightRef.current = true;
    let currentData: AppData | null = dataToSave;

    try {
      while (currentData) {
        setSyncStatus('syncing');
        const result = await pushData(currentData);
        if (result.success) {
          setSyncStatus('saved');
        } else {
          setSyncStatus('error');
          break;
        }
        currentData = pendingSaveRef.current;
        pendingSaveRef.current = null;
      }
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const triggerCloudSave = async (newData: AppData) => {
    if (isConnected) {
      await runCloudSave(newData);
    }
  };

  const autoConnectAndSync = async (newData: AppData) => {
    if (isConnected) {
      await runCloudSave(newData);
      return;
    }

    const savedConfig = localStorage.getItem('tcf-supabase-config');
    if (!savedConfig) return;

    try {
      const { url, key } = JSON.parse(savedConfig);
      if (!initSupabase({ url, key })) return;
      setIsConnected(true);
      await runCloudSave(newData);
    } catch (e) {
      console.error("Auto-connect sync error", e);
    }
  };

  const reconcileLongArticlesWithCloud = async () => {
    const localRaw = localStorage.getItem('tcf-long-articles');
    let localFromStorage: LongArticle[] = [];
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed)) {
          localFromStorage = parsed;
        }
      } catch (e) {
        console.error("Failed to parse local long articles for reconcile", e);
      }
    }

    try {
      const remote = await fetchLongArticles();
      const merged = mergeLongArticles(mergeLongArticles(longArticles, localFromStorage), remote);
      if (merged.length > 0) {
        await upsertLongArticles(merged);
      }
      setLongArticles(merged);
    } catch (e) {
      console.error("Long articles reconcile error", e);
    }
  };

  const autoConnectAndSaveLongArticle = async (article: LongArticle) => {
    if (isConnected) {
      try {
        await upsertLongArticle(article);
      } catch (e) {
        console.error("Cloud save long article error:", e);
      }
      return;
    }

    const savedConfig = localStorage.getItem('tcf-supabase-config');
    if (!savedConfig) return;

    try {
      const { url, key } = JSON.parse(savedConfig);
      if (!initSupabase({ url, key })) return;
      setIsConnected(true);
      await upsertLongArticle(article);
      reconcileLongArticlesWithCloud();
    } catch (e) {
      console.error("Auto-connect long article error", e);
    }
  };

  const handleImport = (items: ImportItem[]) => {
    const normalize = (text: string) => text.trim().toLowerCase();

    setData((prevData) => {
      const newData = [...prevData];

      items.forEach((item) => {
        let category = newData.find(c => normalize(c.name) === normalize(item.category));
        if (!category) {
          category = { id: generateId(), name: item.category, units: [] };
          newData.push(category);
        }

        let unit = category.units.find(u => normalize(u.name) === normalize(item.unit));
        if (!unit) {
          unit = { id: generateId(), name: item.unit, cards: [] };
          category.units.push(unit);
        }

        const exists = unit.cards.some(c => normalize(c.front) === normalize(item.front) && normalize(c.back) === normalize(item.back));
        if (!exists) {
          unit.cards.push({
            id: generateId(),
            front: item.front,
            back: item.back,
            mastered: false
          });
        }
      });
      
      autoConnectAndSync(newData);
      return newData;
    });
  };

  const handleSyncComplete = (newData: AppData) => {
      setData(newData);
      setIsConnected(true);
      setSyncStatus('saved');
      reconcileLongArticlesWithCloud();
  };

  const handleDisconnect = () => {
    localStorage.removeItem('tcf-supabase-config');
    setIsConnected(false);
    setSyncStatus('idle');
    setIsSyncOpen(false);
  };

  const performFixDuplicates = () => {
    setData(prev => {
      const cleaned = consolidateData(prev);
      triggerCloudSave(cleaned); 
      return cleaned;
    });
    alert("Duplicates fixed! Data has been cleaned.");
  };

  const handleFixDuplicates = () => {
    setConfirmState({ type: 'fixDuplicates' });
  };

  const handleUnitClick = (categoryId: string, unitId: string) => {
    setSelectedCategory(categoryId);
    setSelectedUnit(unitId);
    setViewState(ViewState.STUDY);
  };

  const handleAutoPreviewUnit = (categoryId: string, unitId: string) => {
    setSelectedCategory(categoryId);
    setSelectedUnit(unitId);
    setViewState(ViewState.AUTO_PREVIEW);
  };

  const handleDeleteUnit = (e: React.MouseEvent, catIdx: number, unitIdx: number) => {
      e.stopPropagation();
      const unitName = data[catIdx]?.units[unitIdx]?.name || 'this unit';
      setConfirmState({ type: 'deleteUnit', catIdx, unitIdx, unitName });
  }

  const handleConfirmModalConfirm = () => {
      if (!confirmState) return;
      if (confirmState.type === 'resetTimer') {
          performResetTimer();
      } else if (confirmState.type === 'deleteUnit') {
          setData(prevData => {
              const newData = [...prevData];
              if (newData[confirmState.catIdx]) {
                  newData[confirmState.catIdx].units.splice(confirmState.unitIdx, 1);
              }
              triggerCloudSave(newData);
              return newData;
          });
      } else if (confirmState.type === 'fixDuplicates') {
          performFixDuplicates();
      } else if (confirmState.type === 'deleteArticle') {
          setLongArticles(prev => prev.filter(a => a.id !== confirmState.articleId));
          if (selectedArticleId === confirmState.articleId) {
              setSelectedArticleId(null);
              setViewState(ViewState.HOME);
          }
          if (isConnected) {
              deleteLongArticle(confirmState.articleId).catch(e => {
                  console.error("Delete long article error:", e);
              });
          }
      }
      setConfirmState(null);
  };

  const handleConfirmModalCancel = () => setConfirmState(null);

  const handleUpdateCard = (cardId: string, updates: Partial<Flashcard>) => {
      setData(prevData => {
          // Deep clone for safe nested updates
          const newData = prevData.map(cat => ({
              ...cat,
              units: cat.units.map(unit => ({
                  ...unit,
                  cards: unit.cards.map(c => 
                      c.id === cardId ? { ...c, ...updates } : c
                  )
              }))
          }));
          triggerCloudSave(newData);
          return newData;
      });
  };

  // --- DELETE CARD ---
  const handleDeleteCard = (cardId: string) => {
      setData(prevData => {
          // Robust delete using map/filter to ensure new reference and deep update
          const newData = prevData.map(cat => ({
              ...cat,
              units: cat.units.map(unit => ({
                  ...unit,
                  cards: unit.cards.filter(c => c.id !== cardId)
              }))
          }));
          
          triggerCloudSave(newData);
          return newData;
      });
  };

  const handleSaveLongArticle = (payload: { id?: string; title: string; content: string }) => {
      const now = Date.now();
      let savedArticle: LongArticle | null = null;
      setLongArticles(prev => {
          if (payload.id) {
              const updated = prev.map(article => {
                  if (article.id !== payload.id) return article;
                  const next = { ...article, title: payload.title, content: payload.content, updatedAt: now };
                  savedArticle = next;
                  return next;
              });
              return updated;
          }
          const newArticle: LongArticle = {
              id: generateId(),
              title: payload.title,
              content: payload.content,
              createdAt: now,
              updatedAt: now
          };
          savedArticle = newArticle;
          return [newArticle, ...prev];
      });
      setIsArticleModalOpen(false);
      setEditingArticle(null);
      if (savedArticle) {
          autoConnectAndSaveLongArticle(savedArticle);
      }
  };

  const handleEditLongArticle = (article: LongArticle) => {
      setEditingArticle(article);
      setIsArticleModalOpen(true);
  };

  const handleDeleteLongArticle = (article: LongArticle) => {
      setConfirmState({ type: 'deleteArticle', articleId: article.id, title: article.title });
  };

  const handleOpenLongArticle = (articleId: string) => {
      setSelectedArticleId(articleId);
      setViewState(ViewState.LONG_ARTICLE);
  };

  const handleOpenArticleFlashcards = (articleId: string) => {
      setSelectedArticleId(articleId);
      setViewState(ViewState.ARTICLE_FLASHCARDS);
  };
  
  const handleExportCategory = (category: Category) => {
      const exportItems: ImportItem[] = [];
      category.units.forEach(unit => {
          unit.cards.forEach(card => {
              exportItems.push({
                  category: category.name,
                  unit: unit.name,
                  front: card.front,
                  back: card.back
              });
          });
      });

      const jsonString = JSON.stringify(exportItems, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `TCF_${category.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const countDueCards = (cards: Flashcard[]) => {
      return cards.filter(c => isCardDue(c)).length;
  };

  // --- Renders ---

  const renderHome = () => {
    const allDueCount = data.reduce((acc, cat) => 
        acc + cat.units.reduce((uAcc, unit) => 
            uAcc + unit.cards.filter(c => isCardDue(c)).length, 0
        ), 0
    );

    return (
        <div className="max-w-5xl mx-auto w-full p-6">
          <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-300">
                TCF Canada Prep
              </h1>
              <p className="text-slate-400 mt-2">Master French for your immigration exam.</p>
            </div>
            
            <div className="flex gap-3">
                 <div className="flex items-center gap-2 px-3 py-3 bg-slate-800 rounded-lg border border-slate-700" title="Study Time Today">
                     <Clock className="w-5 h-5 text-indigo-400" />
                     <span className={`font-mono font-bold ${isTimerPaused ? 'text-slate-500' : 'text-slate-300'}`}>
                       {formatTime(todayStudyTime, isTimerExpanded)}
                     </span>
                     <button
                       onClick={toggleTimerExpanded}
                       className="text-slate-500 hover:text-slate-200 transition"
                       title={isTimerExpanded ? 'Hide seconds' : 'Show seconds'}
                     >
                       {isTimerExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                     </button>
                     <button
                       onClick={toggleTimerPause}
                       className="text-slate-500 hover:text-slate-200 transition"
                       title={isTimerPaused ? 'Resume timer' : 'Pause timer'}
                     >
                       {isTimerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                     </button>
                 </div>

                 <div className="flex items-center gap-1.5 px-3 py-3 bg-slate-800 rounded-lg border border-slate-700" title="Study Streak">
                     <Flame className={`w-5 h-5 ${streak > 0 ? 'text-orange-500 fill-orange-500' : 'text-slate-600'}`} />
                     <span className={`font-mono font-bold ${streak > 0 ? 'text-orange-400' : 'text-slate-500'}`}>{streak}</span>
                 </div>
    
                 <button 
                   onClick={handleNotificationToggle}
                   className={`p-3 rounded-lg border transition ${notificationsEnabled ? 'bg-indigo-900/50 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                   title={notificationsEnabled ? "Notifications Active" : "Enable Study Reminders"}
                 >
                    {notificationsEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                 </button>
    
                <button
                    onClick={() => setIsSyncOpen(true)}
                    className={`
                      px-4 py-3 rounded-lg font-medium flex items-center gap-2 border transition relative
                      ${isConnected 
                        ? 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                      }
                    `}
                >
                    {!isConnected ? <CloudOff className="w-5 h-5" /> 
                    : syncStatus === 'syncing' ? <Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> 
                    : syncStatus === 'saved' ? <CheckCircle className="w-5 h-5 text-green-400" />
                    : <Cloud className="w-5 h-5 text-indigo-400" />}
                    
                    <span className="hidden sm:inline text-sm">
                       {!isConnected ? "Connect Cloud" 
                        : syncStatus === 'syncing' ? "Saving..." 
                        : syncStatus === 'saved' ? "Saved" 
                        : "Cloud Active"}
                    </span>
                </button>
    
                <button 
                  onClick={() => setIsImportOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 shadow-lg transition"
                >
                <Plus className="w-5 h-5" />
                Import
                </button>
            </div>
          </header>

          {/* Review Dashboard Panel */}
          <div className="mb-8 p-6 bg-gradient-to-r from-indigo-900/50 to-purple-900/50 rounded-2xl border border-indigo-500/30 flex items-center justify-between shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-1/3 -translate-y-1/3 pointer-events-none">
                <Brain className="w-48 h-48 text-indigo-400" />
            </div>
            <div className="relative z-10">
                <h2 className="text-2xl font-bold text-white mb-2">Review Dashboard</h2>
                <p className="text-indigo-200 mb-4 max-w-md">You have <span className="font-bold text-white">{allDueCount}</span> cards due for review.</p>
                <div className="flex gap-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1"><Brain className="w-4 h-4"/> Spaced Repetition Active</span>
                </div>
            </div>
            <div className="relative z-10">
                <button 
                    onClick={() => setViewState(ViewState.STUDY_ALL)}
                    disabled={allDueCount === 0}
                    className="px-8 py-4 bg-white text-indigo-900 font-bold rounded-xl shadow-xl hover:bg-indigo-50 transition transform hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center gap-3"
                >
                    <Play className="w-5 h-5 fill-current" />
                    {allDueCount > 0 ? 'Review All Due' : 'All Caught Up!'}
                </button>
            </div>
          </div>
    
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {data.map((cat, catIdx) => (
              <div key={cat.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col shadow-xl">
                <div className="p-5 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-white">{cat.name}</h2>
                  
                  <div className="ml-auto flex items-center gap-2">
                     <button 
                       onClick={() => handleExportCategory(cat)}
                       className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition"
                       title="Export to JSON"
                     >
                       <Download className="w-4 h-4" />
                     </button>
                     <span className="text-xs font-mono text-slate-500 px-2 py-1 bg-slate-900 rounded">
                       {cat.units.reduce((acc, u) => acc + u.cards.length, 0)} cards
                     </span>
                  </div>
                </div>
                
                <div className="flex-1 p-2 max-h-[300px] overflow-y-auto no-scrollbar">
                  {cat.units.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center text-sm">
                      No units created yet.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {[...cat.units].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map((unit) => {
                        const dueCount = countDueCards(unit.cards);
                        const unitIdx = cat.units.findIndex(u => u.id === unit.id);
                        return (
                          <div 
                            key={unit.id}
                            onClick={() => handleUnitClick(cat.id, unit.id)}
                            className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-700/50 cursor-pointer transition border border-transparent hover:border-slate-600"
                          >
                            <div className="flex items-center gap-3">
                              <BookOpen className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
                              <span className="text-slate-300 group-hover:text-white font-medium text-sm">
                                {unit.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              {dueCount > 0 && (
                                  <div className="flex items-center gap-1 bg-orange-500/10 px-2 py-0.5 rounded text-orange-400 border border-orange-500/20" title="Cards due for review">
                                      <Brain className="w-3 h-3" />
                                      <span className="text-xs font-bold">{dueCount}</span>
                                  </div>
                              )}
                              <button
                                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-cyan-600/20 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-600/30 transition"
                                  onClick={(e) => { e.stopPropagation(); handleAutoPreviewUnit(cat.id, unit.id); }}
                                  title="Auto display due/new cards with cloud voice"
                              >
                                  <Play className="w-3 h-3" />
                                  Auto
                              </button>
                              <span className="text-xs text-slate-500 font-mono">
                                  {unit.cards.length}
                              </span>
                              <button 
                                  className="p-1 hover:text-red-400 text-slate-600 transition"
                                  onClick={(e) => handleDeleteUnit(e, catIdx, unitIdx)}
                                  title="Delete Unit"
                              >
                                  <Trash2 className="w-3 h-3" />
                              </button>
                              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
            <div className="p-5 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white">Long Articles</h2>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => { setEditingArticle(null); setIsArticleModalOpen(true); }}
                  className="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-500 transition"
                >
                  New Article
                </button>
                <span className="text-xs font-mono text-slate-500 px-2 py-1 bg-slate-900 rounded">
                  {longArticles.length} articles
                </span>
              </div>
            </div>

            <div className="p-2 max-h-[320px] overflow-y-auto no-scrollbar">
              {longArticles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center text-sm">
                  No long articles yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {longArticles.map(article => (
                    <div
                      key={article.id}
                      onClick={() => handleOpenLongArticle(article.id)}
                      className="group flex items-center justify-between p-3 rounded-lg hover:bg-slate-700/50 cursor-pointer transition border border-transparent hover:border-slate-600"
                    >
                      <div className="flex items-center gap-3">
                        <BookOpen className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
                        <span className="text-slate-300 group-hover:text-white font-medium text-sm">
                          {article.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-2 py-1 text-xs rounded bg-amber-600/20 text-amber-100 border border-amber-500/30 hover:bg-amber-600/30 transition"
                          onClick={(e) => { e.stopPropagation(); handleOpenArticleFlashcards(article.id); }}
                          title="Study as sequential flashcards"
                        >
                          Sequence
                        </button>
                        <button
                          className="p-1.5 text-slate-500 hover:text-indigo-300 hover:bg-slate-700 rounded transition"
                          onClick={(e) => { e.stopPropagation(); handleEditLongArticle(article); }}
                          title="Edit Article"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition"
                          onClick={(e) => { e.stopPropagation(); handleDeleteLongArticle(article); }}
                          title="Delete Article"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
  }

  const renderStudy = () => {
    let cardsToStudy: Flashcard[] = [];
    let studyQueueCards: Flashcard[] | undefined;
    let title = "";
    let unitIdForProgress = "";

    if (viewState === ViewState.STUDY_ALL) {
        // Collect all due cards
        data.forEach(cat => cat.units.forEach(u => {
            u.cards.forEach(c => {
                if (isCardDue(c)) {
                    cardsToStudy.push(c);
                }
            });
        }));
        studyQueueCards = cardsToStudy;
        title = "Review All Due Cards";
        unitIdForProgress = "review-all-session";
    } else if (viewState === ViewState.AUTO_PREVIEW) {
        const category = data.find(c => c.id === selectedCategory);
        const unit = category?.units.find(u => u.id === selectedUnit);
        if (category && unit) {
            cardsToStudy = unit.cards.filter(isCardDue);
            studyQueueCards = cardsToStudy;
            title = `${category.name} - ${unit.name} (Auto Display)`;
            unitIdForProgress = unit.id;
        } else {
             return (
                <div className="flex flex-col items-center justify-center h-screen">
                    <p className="text-red-400">Unit not found or empty.</p>
                    <button onClick={() => setViewState(ViewState.HOME)} className="mt-4 text-white underline">Go Home</button>
                </div>
              );
        }
    } else {
        const category = data.find(c => c.id === selectedCategory);
        const unit = category?.units.find(u => u.id === selectedUnit);
        if (category && unit) {
            cardsToStudy = unit.cards;
            studyQueueCards = unit.cards.filter(isCardDue);
            title = `${category.name} - ${unit.name}`;
            unitIdForProgress = unit.id;
        } else {
             return (
                <div className="flex flex-col items-center justify-center h-screen">
                    <p className="text-red-400">Unit not found or empty.</p>
                    <button onClick={() => setViewState(ViewState.HOME)} className="mt-4 text-white underline">Go Home</button>
                </div>
              );
        }
    }

    if (viewState === ViewState.STUDY_ALL && cardsToStudy.length === 0) {
         return (
            <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
                <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">No Due Cards</h2>
                <p className="text-slate-400 mb-8 max-w-md">You have no cards waiting for review at this moment. Great job!</p>
                <button 
                    onClick={() => setViewState(ViewState.HOME)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg transition"
                >
                    Back to Dashboard
                </button>
            </div>
         );
    }

    if (viewState === ViewState.AUTO_PREVIEW && cardsToStudy.length === 0) {
         return (
            <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
                <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">No New or Due Cards</h2>
                <p className="text-slate-400 mb-8 max-w-md">Auto display only cycles cards that are new or currently due. This set has none right now.</p>
                <button 
                    onClick={() => setViewState(ViewState.HOME)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg transition"
                >
                    Back to Dashboard
                </button>
            </div>
         );
    }

    return (
      <FlashcardView 
        cards={cardsToStudy} 
        studyCards={studyQueueCards}
        title={title}
        onBack={() => setViewState(ViewState.HOME)}
        unitId={unitIdForProgress}
        onUpdateCard={handleUpdateCard}
        onDeleteCard={viewState === ViewState.AUTO_PREVIEW ? undefined : handleDeleteCard}
        onStudyActivity={viewState === ViewState.AUTO_PREVIEW ? undefined : handleStudyActivity}
        todayStudyTime={todayStudyTime}
        onResetTimer={handleResetTimer}
        isTimerPaused={isTimerPaused}
        isTimerExpanded={isTimerExpanded}
        onToggleTimerPause={toggleTimerPause}
        onToggleTimerExpanded={toggleTimerExpanded}
        autoPreview={viewState === ViewState.AUTO_PREVIEW}
      />
    );
  };

  const renderLongArticle = () => {
    const article = longArticles.find(a => a.id === selectedArticleId);
    if (!article) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
          <p className="text-red-400">Article not found.</p>
          <button onClick={() => setViewState(ViewState.HOME)} className="mt-4 text-white underline">Go Home</button>
        </div>
      );
    }

    return (
      <LongArticleView
        article={article}
        onBack={() => { setViewState(ViewState.HOME); setSelectedArticleId(null); }}
        onCloudSave={autoConnectAndSaveLongArticle}
        onStudyFlashcards={() => handleOpenArticleFlashcards(article.id)}
        onUpdateArticle={handleSaveLongArticle}
      />
    );
  };

  const renderArticleFlashcards = () => {
    const article = longArticles.find(a => a.id === selectedArticleId);
    if (!article) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
          <p className="text-red-400">Article not found.</p>
          <button onClick={() => setViewState(ViewState.HOME)} className="mt-4 text-white underline">Go Home</button>
        </div>
      );
    }

    const cardsToStudy = buildArticleSequenceCards(article);

    if (cardsToStudy.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
          <p className="text-slate-300 text-xl font-semibold">No sentences found</p>
          <p className="text-slate-400 mt-2 max-w-md">Add punctuation to the article and try again. The sequence flashcards are generated sentence by sentence.</p>
          <button
            onClick={() => setViewState(ViewState.LONG_ARTICLE)}
            className="mt-6 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg transition"
          >
            Back to Article
          </button>
        </div>
      );
    }

    return (
      <FlashcardView
        cards={cardsToStudy}
        title={`${article.title} (Sequential Flashcards)`}
        onBack={() => setViewState(ViewState.LONG_ARTICLE)}
        unitId={`article-sequence-${article.id}`}
        onUpdateCard={() => {}}
        onStudyActivity={handleStudyActivity}
        todayStudyTime={todayStudyTime}
        onResetTimer={handleResetTimer}
        isTimerPaused={isTimerPaused}
        isTimerExpanded={isTimerExpanded}
        onToggleTimerPause={toggleTimerPause}
        onToggleTimerExpanded={toggleTimerExpanded}
        studyMode="sequence"
      />
    );
  };

  const confirmContent = confirmState ? (() => {
      switch (confirmState.type) {
          case 'resetTimer':
              return {
                  title: "Reset Timer",
                  message: "Reset today's study timer back to 0? This cannot be undone.",
                  tone: 'danger' as const,
                  confirmLabel: 'Reset Timer'
              };
          case 'deleteUnit':
              return {
                  title: "Delete Unit",
                  message: `Delete "${confirmState.unitName}" and all its cards?`,
                  tone: 'danger' as const,
                  confirmLabel: 'Delete'
              };
          case 'fixDuplicates':
              return {
                  title: "Clean Duplicates",
                  message: "Merge categories/units with the same name and remove duplicate cards. Proceed?",
                  tone: 'info' as const,
                  confirmLabel: 'Clean Now'
              };
          case 'deleteArticle':
              return {
                  title: "Delete Article",
                  message: `Delete "${confirmState.title}" permanently?`,
                  tone: 'danger' as const,
                  confirmLabel: 'Delete'
              };
          default:
              return null;
      }
  })() : null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      {viewState === ViewState.HOME && renderHome()}
      {(viewState === ViewState.STUDY || viewState === ViewState.STUDY_ALL || viewState === ViewState.AUTO_PREVIEW) && renderStudy()}
      {viewState === ViewState.LONG_ARTICLE && renderLongArticle()}
      {viewState === ViewState.ARTICLE_FLASHCARDS && renderArticleFlashcards()}
      
      <ImportModal 
        isOpen={isImportOpen} 
        onClose={() => setIsImportOpen(false)} 
        onImport={handleImport} 
      />

      <LongArticleModal
        isOpen={isArticleModalOpen}
        onClose={() => { setIsArticleModalOpen(false); setEditingArticle(null); }}
        onSave={handleSaveLongArticle}
        initial={editingArticle}
      />
      
      <SyncModal
        isOpen={isSyncOpen}
        onClose={() => setIsSyncOpen(false)}
        currentData={data}
        onSyncComplete={handleSyncComplete}
        isConnected={isConnected}
        onDisconnect={handleDisconnect}
        onFixDuplicates={handleFixDuplicates}
      />
      
      <ConfirmModal 
        open={!!confirmState}
        title={confirmContent?.title || ''}
        message={confirmContent?.message || ''}
        confirmLabel={confirmContent?.confirmLabel}
        tone={confirmContent?.tone}
        onConfirm={handleConfirmModalConfirm}
        onCancel={handleConfirmModalCancel}
      />
    </div>
  );
}
