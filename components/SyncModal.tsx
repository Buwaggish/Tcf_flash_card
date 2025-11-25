import React, { useState, useEffect } from 'react';
import { X, Cloud, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { SyncConfig, initSupabase, syncData } from '../services/syncService';
import { AppData } from '../types';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentData: AppData;
  onSyncComplete: (data: AppData) => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose, currentData, onSyncComplete }) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'syncing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      const savedConfig = localStorage.getItem('tcf-supabase-config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        setUrl(parsed.url);
        setKey(parsed.key);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectAndSync = async () => {
    if (!url || !key) {
      setStatus('error');
      setMessage("Please enter both URL and API Key.");
      return;
    }

    setStatus('connecting');
    const initialized = initSupabase({ url, key });
    
    if (!initialized) {
      setStatus('error');
      setMessage("Invalid URL format.");
      return;
    }

    // Save credentials
    localStorage.setItem('tcf-supabase-config', JSON.stringify({ url, key }));

    setStatus('syncing');
    const result = await syncData(currentData);

    if (result.success && result.data) {
      setStatus('success');
      setMessage("Sync complete! Cloud and Local are now in sync.");
      onSyncComplete(result.data);
      setTimeout(() => {
          onClose();
          setStatus('idle');
      }, 1500);
    } else {
      setStatus('error');
      setMessage(result.error || "Sync failed. Check your table permissions.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-indigo-400" />
            Cloud Sync Settings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-lg text-xs text-indigo-200">
            <p className="font-bold mb-1">How to set up:</p>
            <ol className="list-decimal list-inside space-y-1 opacity-90">
                <li>Create a free project at <b>supabase.com</b></li>
                <li>Create a table named <code>tcf_sync</code> with columns: <code>id</code> (int8, PK), <code>content</code> (jsonb).</li>
                <li>Insert a row: <code>id: 1</code>, <code>content: []</code></li>
            </ol>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Project URL</label>
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xyz.supabase.co"
              className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Anon Public Key</label>
            <input 
              type="password" 
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5c..."
              className="w-full bg-slate-900 border border-slate-700 text-white p-2 rounded focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          {status === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 p-2 rounded">
              <AlertCircle className="w-4 h-4" />
              {message}
            </div>
          )}
           {status === 'success' && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/20 p-2 rounded">
              <CheckCircle className="w-4 h-4" />
              {message}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-900/50 flex justify-end">
          <button
            onClick={handleConnectAndSync}
            disabled={status === 'connecting' || status === 'syncing'}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium transition"
          >
            {(status === 'connecting' || status === 'syncing') ? (
               <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
               <Save className="w-4 h-4" />
            )}
            {status === 'connecting' ? 'Connecting...' : status === 'syncing' ? 'Syncing...' : 'Connect & Sync'}
          </button>
        </div>
      </div>
    </div>
  );
};
