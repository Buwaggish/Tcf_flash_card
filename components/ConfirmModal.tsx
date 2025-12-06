import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'info',
  onConfirm,
  onCancel
}) => {
  if (!open) return null;

  const accent =
    tone === 'danger'
      ? 'text-red-400 bg-red-500/10 border-red-500/30'
      : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${accent}`}>
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white transition"
            aria-label="Close confirmation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
          {message}
        </div>
        <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-300 hover:text-white transition rounded-lg"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition shadow-lg ${
              tone === 'danger'
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
