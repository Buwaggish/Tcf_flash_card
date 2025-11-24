import React, { useState } from 'react';
import { ImportItem } from '../types';
import { X, Upload, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ImportItem[]) => void;
}

const SAMPLE_JSON = `[
  {
    "category": "Expression Orale",
    "unit": "Unit 1: Salutations",
    "front": "Good morning (Formal)",
    "back": "Bonjour madame"
  },
  {
    "category": "Expression Orale",
    "unit": "Unit 1: Salutations",
    "front": "How are you?",
    "back": "Comment allez-vous aujourd'hui"
  }
]`;

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) {
        throw new Error("Root element must be an array.");
      }
      // Basic validation
      const validItems = parsed.filter((item: any) => 
        item.category && item.unit && item.front && item.back
      );

      if (validItems.length === 0) {
        throw new Error("No valid flashcards found. Check format.");
      }

      onImport(validItems);
      setJsonInput('');
      setError(null);
      onClose();
    } catch (err: any) {
      setError(err.message || "Invalid JSON format");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-400" />
            Import Flashcards
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-slate-300 mb-4">
            Paste your JSON list below. Ensure strict JSON format.
          </p>
          
          <div className="bg-slate-900 rounded-lg p-3 mb-4 border border-slate-700">
            <p className="text-xs text-slate-500 font-mono mb-2">EXPECTED FORMAT:</p>
            <pre className="text-xs text-indigo-300 font-mono whitespace-pre-wrap select-all cursor-pointer" onClick={() => setJsonInput(SAMPLE_JSON)}>
              {SAMPLE_JSON}
            </pre>
          </div>

          <textarea
            className="w-full h-48 bg-slate-950 text-slate-200 p-4 rounded-lg border border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-sm"
            placeholder="Paste JSON here..."
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />

          {error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-200 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white transition"
          >
            Cancel
          </button>
          <button 
            onClick={handleImport}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center gap-2 transition shadow-lg shadow-indigo-900/20"
          >
            <CheckCircle className="w-4 h-4" />
            Import Data
          </button>
        </div>
      </div>
    </div>
  );
};