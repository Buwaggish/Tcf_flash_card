import React, { useState, useEffect } from 'react';
import { X, Cloud, Save, Loader2, CheckCircle, AlertCircle, RefreshCw, Unplug, Wrench, ArrowUpCircle } from 'lucide-react';
import { initSupabase, syncData, fetchCloudCount, getCardCount, pushData } from '../services/syncService';
import { AppData } from '../types';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentData: AppData;
  onSyncComplete: (data: AppData) => void;
  onDisconnect: () => void;
  onFixDuplicates: () => void;
  isConnected: boolean;
}

export const SyncModal: React.FC<SyncModalProps> = ({ 
  isOpen, onClose, currentData, onSyncComplete, onDisconnect, onFixDuplicates, isConnected 
}) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'syncing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  
  // Stats
  const [localCount, setLocalCount] = useState(0);
  const [cloudCount, setCloudCount] = useState<number | null>(null);
  const [checkingStats, setCheckingStats] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const savedConfig = localStorage.getItem('tcf-supabase-config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        setUrl(parsed.url);
        setKey(parsed.key);
      }
      setLocalCount(getCardCount(currentData));
      if (isConnected) {
          checkStats();
      }
    }
  }, [isOpen, currentData, isConnected]);

  const checkStats = async () => {
      setCheckingStats(true);
      const count = await fetchCloudCount();
      setCloudCount(count);
      setCheckingStats(false);
  };

  if (!isOpen) return null;

  const handleConnect = async (isForceSync = false) => {
    if (!url || !key) {
      setStatus('error');
      setMessage("Please enter both URL and API Key.");
      return;
    }

    setStatus(isForceSync ? 'syncing' : 'connecting');
    const initialized = initSupabase({ url, key });
    
    if (!initialized) {
      setStatus('error');
      setMessage("Invalid URL format.");
      return;
    }

    // Save credentials
    localStorage.setItem('tcf-supabase-config', JSON.stringify({ url, key }));

    // Perform sync
    setStatus('syncing');
    const result = await syncData(currentData);

    if (result.success && result.data) {
      setStatus('success');
      setMessage(isForceSync ? "Merged Cloud & Local data!" : "Connected successfully.");
      onSyncComplete(result.data);
      checkStats(); // Refresh stats after sync
      setTimeout(() => {
          if (!isForceSync) onClose();
          setStatus('idle');
      }, 1500);
    } else {
      setStatus('error');
      setMessage(result.error || "Connection failed. Check permissions.");
    }
  };

  const handleForcePush = async () => {
      if(!confirm("DANGER: This will overwrite the Cloud with your Local data. Any unique data on the Cloud will be lost. Continue?")) return;
      
      setStatus('syncing');
      const result = await pushData(currentData);
      if (result.success) {
          setStatus('success');
          setMessage("Cloud overwritten with Local data.");
          checkStats();
          setTimeout(() => setStatus('idle'), 2000);
      } else {
          setStatus('error');
          setMessage(result.error || "Push failed.");
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800 shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-indigo-400" />
            Cloud Connection
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {isConnected ? (
            <div className="space-y-3">
                 <div className="bg-green-900/20 border border-green-500/30 p-3 rounded-lg flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-full">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                        <p className="text-green-300 font-bold text-sm">System Connected</p>
                        <p className="text-green-400/70 text-xs">Sync is active and automatic.</p>
                    </div>
                 </div>

                 {/* Stats Card */}
                 <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700 flex justify-between items-center">
                    <div className="text-center w-1/2 border-r border-slate-700">
                        <p className="text-xs text-slate-500 uppercase font-bold">Local Cards</p>
                        <p className="text-xl font-mono text-white">{localCount}</p>
                    </div>
                    <div className="text-center w-1/2 relative">
                        <p className="text-xs text-slate-500 uppercase font-bold">Cloud Cards</p>
                        <p className={`text-xl font-mono ${cloudCount !== null && cloudCount < localCount ? 'text-orange-400' : 'text-indigo-400'}`}>
                            {checkingStats ? '...' : (cloudCount ?? '?')}
                        </p>
                         <button onClick={checkStats} className="absolute top-0 right-2 p-1 text-slate-600 hover:text-white" title="Refresh Stats"><RefreshCw className="w-3 h-3"/></button>
                    </div>
                 </div>
            </div>
          ) : (
            <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-lg text-xs text-indigo-200">
              <p className="font-bold mb-1">Setup Supabase (Free):</p>
              <ol className="list-decimal list-inside space-y-1 opacity-90">
                  <li>Create project at <b>supabase.com</b></li>
                  <li>Run SQL: <code>create table tcf_categories (id text primary key, name text, snapshot_id text, updated_at timestamptz);</code></li>
                  <li>Run SQL: <code>create table tcf_units (id text primary key, category_id text, name text, snapshot_id text, updated_at timestamptz);</code></li>
                  <li>Run SQL: <code>create table tcf_cards (id text primary key, unit_id text, front text, back text, mastered boolean, srs jsonb, snapshot_id text, updated_at timestamptz);</code></li>
                  <li>Run SQL: <code>create table tcf_sync_meta (key text primary key, value text, updated_at timestamptz);</code></li>
                  <li className="text-orange-300 mt-1">Run SQL: <code>create table study_logs (date_id text primary key, duration int, updated_at timestamptz);</code></li>
              </ol>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Project URL</label>
              <input 
                type="text" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xyz.supabase.co"
                className="w-full bg-slate-900 border border-slate-700 text-white p-2.5 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Anon Public Key</label>
              <input 
                type="password" 
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5c..."
                className="w-full bg-slate-900 border border-slate-700 text-white p-2.5 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
              />
            </div>
          </div>

          {/* Maintenance Section */}
          <div className="border-t border-slate-700 pt-3 space-y-2">
             <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-3 h-3 text-orange-400" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Maintenance</span>
             </div>
             
             <div className="grid grid-cols-2 gap-2">
                 <button
                   onClick={onFixDuplicates}
                   className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition"
                   title="Merges duplicate categories/units"
                 >
                   <RefreshCw className="w-3 h-3" />
                   Clean Duplicates
                 </button>

                 <button
                   onClick={handleForcePush}
                   className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-red-900/50 hover:text-red-200 text-slate-300 rounded-lg text-xs transition"
                   title="Overwrite Cloud with Local Data"
                 >
                   <ArrowUpCircle className="w-3 h-3" />
                   Force Push
                 </button>
             </div>
             <p className="text-[10px] text-slate-500 text-center">
               Use Force Push on the device that has the correct data (71 cards) if Cloud is stuck (53 cards).
             </p>
          </div>

          {status === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 p-2 rounded animate-in fade-in">
              <AlertCircle className="w-4 h-4" />
              {message}
            </div>
          )}
           {status === 'success' && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/20 p-2 rounded animate-in fade-in">
              <CheckCircle className="w-4 h-4" />
              {message}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-900/50 flex justify-between items-center shrink-0">
           {isConnected ? (
             <div className="flex gap-2">
                <button
                  onClick={onDisconnect}
                  className="px-3 py-2 text-red-400 hover:bg-red-900/20 rounded-lg text-sm font-medium transition flex items-center gap-2"
                >
                  <Unplug className="w-4 h-4" />
                  Disconnect
                </button>
                 <button
                  onClick={() => handleConnect(true)}
                  className="px-3 py-2 text-slate-300 hover:bg-slate-800 rounded-lg text-sm font-medium transition flex items-center gap-2"
                  title="Manually pull & merge from cloud"
                >
                  <RefreshCw className={`w-4 h-4 ${status === 'syncing' ? 'animate-spin' : ''}`} />
                  Force Pull & Merge
                </button>
             </div>
           ) : (
             <div></div>
           )}

          <button
            onClick={() => handleConnect(false)}
            disabled={status === 'connecting' || status === 'syncing'}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium transition shadow-lg shadow-indigo-900/20"
          >
            {(status === 'connecting' || status === 'syncing') ? (
               <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
               <Save className="w-4 h-4" />
            )}
            {isConnected ? 'Update' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
};
