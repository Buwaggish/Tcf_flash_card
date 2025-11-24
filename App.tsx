import React, { useState, useEffect } from 'react';
import { AppData, Category, Flashcard, ImportItem, ViewState } from './types';
import { ImportModal } from './components/ImportModal';
import { FlashcardView } from './components/FlashcardView';
import { Plus, BookOpen, ChevronRight, Layers, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid'; // Since we can't install, I'll mock uuid simple function below

// Simple UUID generator since we can't rely on external packages in this prompt context without npm install
const generateId = () => Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);

export default function App() {
  const [data, setData] = useState<AppData>([]);
  const [viewState, setViewState] = useState<ViewState>(ViewState.HOME);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('tcf-cards-data');
    if (saved) {
      try {
        setData(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load data", e);
      }
    } else {
        // Initial Demo Data
        setData([
            {
                id: generateId(),
                name: "Compréhension Orale",
                units: []
            },
            {
                id: generateId(),
                name: "Expression Orale",
                units: []
            },
            {
                id: generateId(),
                name: "Compréhension Écrite",
                units: []
            },
            {
                id: generateId(),
                name: "Expression Écrite",
                units: []
            }
        ])
    }
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      localStorage.setItem('tcf-cards-data', JSON.stringify(data));
    }
  }, [data]);

  const handleImport = (items: ImportItem[]) => {
    setData((prevData) => {
      const newData = [...prevData];

      items.forEach((item) => {
        // 1. Find or Create Category
        let category = newData.find(c => c.name.toLowerCase() === item.category.toLowerCase());
        if (!category) {
          category = { id: generateId(), name: item.category, units: [] };
          newData.push(category);
        }

        // 2. Find or Create Unit
        let unit = category.units.find(u => u.name.toLowerCase() === item.unit.toLowerCase());
        if (!unit) {
            // Sort units roughly?
          unit = { id: generateId(), name: item.unit, cards: [] };
          category.units.push(unit);
        }

        // 3. Add Card
        unit.cards.push({
          id: generateId(),
          front: item.front,
          back: item.back,
          mastered: false
        });
      });
      return newData;
    });
  };

  const handleUnitClick = (categoryId: string, unitId: string) => {
    setSelectedCategory(categoryId);
    setSelectedUnit(unitId);
    setViewState(ViewState.STUDY);
  };

  const handleDeleteUnit = (e: React.MouseEvent, catIdx: number, unitIdx: number) => {
      e.stopPropagation();
      if(!confirm("Are you sure you want to delete this unit and all its cards?")) return;
      
      const newData = [...data];
      newData[catIdx].units.splice(unitIdx, 1);
      setData(newData);
  }

  // --- Renders ---

  const renderHome = () => (
    <div className="max-w-5xl mx-auto w-full p-6">
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-300">
            TCF Canada Prep
          </h1>
          <p className="text-slate-400 mt-2">Master French for your immigration exam.</p>
        </div>
        <button 
          onClick={() => setIsImportOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-indigo-900/20 transition transform hover:scale-105"
        >
          <Plus className="w-5 h-5" />
          Import Flashcards
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {data.map((cat, catIdx) => (
          <div key={cat.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col shadow-xl">
            <div className="p-5 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                <Layers className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white">{cat.name}</h2>
              <span className="ml-auto text-xs font-mono text-slate-500 px-2 py-1 bg-slate-900 rounded">
                {cat.units.reduce((acc, u) => acc + u.cards.length, 0)} cards
              </span>
            </div>
            
            <div className="flex-1 p-2 max-h-[300px] overflow-y-auto no-scrollbar">
              {cat.units.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center text-sm">
                  No units created yet. <br/> Use the Import button to add JSON data.
                </div>
              ) : (
                <div className="space-y-1">
                  {cat.units.map((unit, unitIdx) => (
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
                        <span className="text-xs text-slate-500 font-mono">
                            {unit.cards.length}
                        </span>
                        <button 
                            className="p-1 hover:text-red-400 text-slate-600 transition"
                            onClick={(e) => handleDeleteUnit(e, catIdx, unitIdx)}
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStudy = () => {
    const category = data.find(c => c.id === selectedCategory);
    const unit = category?.units.find(u => u.id === selectedUnit);

    if (!category || !unit || unit.cards.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-screen">
            <p className="text-red-400">Unit not found or empty.</p>
            <button onClick={() => setViewState(ViewState.HOME)} className="mt-4 text-white underline">Go Home</button>
        </div>
      );
    }

    return (
      <FlashcardView 
        cards={unit.cards} 
        title={`${category.name} - ${unit.name}`}
        onBack={() => setViewState(ViewState.HOME)}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
      {viewState === ViewState.HOME && renderHome()}
      {viewState === ViewState.STUDY && renderStudy()}
      
      <ImportModal 
        isOpen={isImportOpen} 
        onClose={() => setIsImportOpen(false)} 
        onImport={handleImport} 
      />
    </div>
  );
}