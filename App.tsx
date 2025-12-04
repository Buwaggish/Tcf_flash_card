import React, { useState, useEffect } from 'react';
import { AppData, Category, Flashcard, ImportItem, ViewState } from './types';
import { ImportModal } from './components/ImportModal';
import { FlashcardView } from './components/FlashcardView';
import { SyncModal } from './components/SyncModal';
import { Plus, BookOpen, ChevronRight, Layers, Trash2, Cloud, Loader2, CheckCircle, CloudOff, Brain, Download, Bell, BellOff, Flame, Play, Clock } from 'lucide-react';
import { initSupabase, syncData, pushData, consolidateData, saveStudyLog } from './services/syncService';
import { isCardDue } from './services/srsService';

// Simple UUID generator
const generateId = () => Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);

export default function App() {
  const [data, setData] = useState<AppData>([]);
  const [viewState, setViewState] = useState<ViewState>(ViewState.HOME);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  
  // Modals
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  // Sync Status
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [isConnected, setIsConnected] = useState(false);

  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [lastNotificationTime, setLastNotificationTime] = useState(0);

  // Streak & Timer
  const [streak, setStreak] = useState(0);
  const [todayStudyTime, setTodayStudyTime] = useState(0); // seconds

  // --- TIMER LOGIC ---
  useEffect(() => {
      const today = new Date().toDateString();
      const savedDate = localStorage.getItem('tcf-study-date');
      if (savedDate === today) {
          const savedTime = parseInt(localStorage.getItem('tcf-study-time') || '0', 10);
          setTodayStudyTime(savedTime);
      } else {
          localStorage.setItem('tcf-study-date', today);
          localStorage.setItem('tcf-study-time', '0');
          setTodayStudyTime(0);
      }

      const interval = setInterval(() => {
          if (document.visibilityState === 'visible') {
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
  }, []);

  const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
  };

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
             syncData(localData).then((result) => {
                 if (result.success && result.data) {
                     setData(result.data);
                     setSyncStatus('saved');
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
    if (data.length > 0) {
      localStorage.setItem('tcf-cards-data', JSON.stringify(data));
    }
  }, [data]);

  const triggerCloudSave = async (newData: AppData) => {
    if (isConnected) {
        setSyncStatus('syncing');
        const result = await pushData(newData);
        if (result.success) {
            setSyncStatus('saved');
        } else {
            setSyncStatus('error');
        }
    }
  };

  const handleImport = (items: ImportItem[]) => {
    setData((prevData) => {
      const newData = [...prevData];

      items.forEach((item) => {
        let category = newData.find(c => c.name.trim().toLowerCase() === item.category.trim().toLowerCase());
        if (!category) {
          category = { id: generateId(), name: item.category, units: [] };
          newData.push(category);
        }

        let unit = category.units.find(u => u.name.trim().toLowerCase() === item.unit.trim().toLowerCase());
        if (!unit) {
          unit = { id: generateId(), name: item.unit, cards: [] };
          category.units.push(unit);
        }

        unit.cards.push({
          id: generateId(),
          front: item.front,
          back: item.back,
          mastered: false
        });
      });
      
      triggerCloudSave(newData);
      return newData;
    });
  };

  const handleSyncComplete = (newData: AppData) => {
      setData(newData);
      setIsConnected(true);
      setSyncStatus('saved');
  };

  const handleDisconnect = () => {
    localStorage.removeItem('tcf-supabase-config');
    setIsConnected(false);
    setSyncStatus('idle');
    setIsSyncOpen(false);
  };

  const handleFixDuplicates = async () => {
    if(!confirm("This will merge categories and units with the same name and remove duplicate cards. The result will be saved to your cloud. Continue?")) return;
    
    setData(prev => {
      const cleaned = consolidateData(prev);
      triggerCloudSave(cleaned); 
      return cleaned;
    });
    alert("Duplicates fixed! Data has been cleaned.");
  };

  const handleUnitClick = (categoryId: string, unitId: string) => {
    setSelectedCategory(categoryId);
    setSelectedUnit(unitId);
    setViewState(ViewState.STUDY);
  };

  const handleDeleteUnit = (e: React.MouseEvent, catIdx: number, unitIdx: number) => {
      e.stopPropagation();
      if(!confirm("Are you sure you want to delete this unit and all its cards?")) return;
      
      setData(prevData => {
          const newData = [...prevData];
          newData[catIdx].units.splice(unitIdx, 1);
          triggerCloudSave(newData);
          return newData;
      });
  }

  const handleUpdateCard = (cardId: string, updates: Partial<Flashcard>) => {
      setData(prevData => {
          const newData = [...prevData];
          for(const cat of newData) {
              for (const unit of cat.units) {
                  const cardIndex = unit.cards.findIndex(c => c.id === cardId);
                  if (cardIndex !== -1) {
                      unit.cards[cardIndex] = { ...unit.cards[cardIndex], ...updates };
                      triggerCloudSave(newData);
                      return newData;
                  }
              }
          }
          return newData;
      });
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
                 <div className="flex items-center gap-1.5 px-3 py-3 bg-slate-800 rounded-lg border border-slate-700" title="Study Time Today">
                     <Clock className="w-5 h-5 text-indigo-400" />
                     <span className="font-mono font-bold text-slate-300">{formatTime(todayStudyTime)}</span>
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
                      {cat.units.map((unit, unitIdx) => {
                        const dueCount = countDueCards(unit.cards);
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
        </div>
      );
  }

  const renderStudy = () => {
    let cardsToStudy: Flashcard[] = [];
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
        title = "Review All Due Cards";
        unitIdForProgress = "review-all-session";
    } else {
        const category = data.find(c => c.id === selectedCategory);
        const unit = category?.units.find(u => u.id === selectedUnit);
        if (category && unit) {
            cardsToStudy = unit.cards;
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

    return (
      <FlashcardView 
        cards={cardsToStudy} 
        title={title}
        onBack={() => setViewState(ViewState.HOME)}
        unitId={unitIdForProgress}
        onUpdateCard={handleUpdateCard}
        onStudyActivity={handleStudyActivity}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      {viewState === ViewState.HOME && renderHome()}
      {(viewState === ViewState.STUDY || viewState === ViewState.STUDY_ALL) && renderStudy()}
      
      <ImportModal 
        isOpen={isImportOpen} 
        onClose={() => setIsImportOpen(false)} 
        onImport={handleImport} 
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
    </div>
  );
}