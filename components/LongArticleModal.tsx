import React, { useEffect, useState } from 'react';
import { X, CheckCircle, FileText } from 'lucide-react';
import { LongArticle } from '../types';

interface LongArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: { id?: string; title: string; content: string }) => void;
  initial?: LongArticle | null;
}

export const LongArticleModal: React.FC<LongArticleModalProps> = ({ isOpen, onClose, onSave, initial }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setContent(initial.content);
    } else {
      setTitle('');
      setContent('');
    }
    setError(null);
  }, [initial, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle || !trimmedContent) {
      setError('Please provide both a title and content.');
      return;
    }

    onSave({ id: initial?.id, title: trimmedTitle, content: trimmedContent });
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl border border-slate-700 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            {initial ? 'Edit Long Article' : 'New Long Article'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="e.g. La vie au Canada"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              rows={10}
              placeholder="Paste your long article here..."
            />
            <p className="mt-2 text-xs text-slate-500">Tip: Use punctuation. The reader will speak sentence by sentence.</p>
          </div>

          {error && (
            <div className="mt-2 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
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
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center gap-2 transition shadow-lg shadow-indigo-900/20"
          >
            <CheckCircle className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
