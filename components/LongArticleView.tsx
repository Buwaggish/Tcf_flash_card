import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LongArticle } from '../types';
import { cancelSpeech, getFrenchVoices, speak, speakViaLocalNarrationService } from '../services/ttsService';
import { playAzureTTS, stopAzureTTS } from '../services/azureService';
import { splitIntoSentences } from '../services/textSegmentation';
import { ConfirmModal } from './ConfirmModal';
import { ArrowLeft, Play, Pause, Square, SkipBack, SkipForward, Settings, CloudLightning, Volume2, Mic, CloudUpload, Layers, Trash2 } from 'lucide-react';

interface LongArticleViewProps {
  article: LongArticle;
  onBack: () => void;
  onCloudSave?: (article: LongArticle) => Promise<void>;
  onStudyFlashcards?: () => void;
  onUpdateArticle?: (payload: { id: string; title: string; content: string }) => void;
}

export const LongArticleView: React.FC<LongArticleViewProps> = ({ article, onBack, onCloudSave, onStudyFlashcards, onUpdateArticle }) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  type TtsMode = 'local' | 'cloud' | 'local-service' | 'cloud-save';
  const [ttsMode, setTtsMode] = useState<TtsMode>(() => {
    const saved = localStorage.getItem('tcf-long-tts-mode');
    if (saved === 'cloud' || saved === 'local' || saved === 'local-service' || saved === 'cloud-save') {
      return saved;
    }
    return 'local';
  });
  const [azureRegion, setAzureRegion] = useState(() => localStorage.getItem('tcf-azure-region') || '');
  const [azureKey, setAzureKey] = useState(() => localStorage.getItem('tcf-azure-key') || '');
  const playSessionRef = useRef(0);
  const cloudSaveAlertedRef = useRef(false);
  const cloudSaveRequestedRef = useRef<Set<string>>(new Set());

  const sentences = useMemo(() => splitIntoSentences(article.content), [article.content]);

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
      stopAzureTTS({ silent: true });
    };
  }, []);

  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
    cancelSpeech();
    setPendingDeleteIndex(null);
  }, [article.id]);

  useEffect(() => {
    setCurrentIndex(prev => {
      if (sentences.length === 0) return 0;
      return Math.min(prev, sentences.length - 1);
    });
  }, [sentences.length]);

  const getSelectedVoice = useCallback(() => {
    return voices.find(v => v.name === selectedVoiceName) || null;
  }, [voices, selectedVoiceName]);

  const stopPlayback = useCallback(() => {
    playSessionRef.current += 1;
    cancelSpeech();
    stopAzureTTS();
    setIsPlaying(false);
  }, []);

  const playFromIndex = useCallback(async (startIndex: number) => {
    if (sentences.length === 0) return;
    if ((ttsMode === 'cloud' || ttsMode === 'cloud-save') && (!azureRegion || !azureKey)) {
      setShowVoiceSettings(true);
      return;
    }
    const sessionId = playSessionRef.current + 1;
    playSessionRef.current = sessionId;
    setIsPlaying(true);
    setCurrentIndex(startIndex);

    for (let i = startIndex; i < sentences.length; i += 1) {
      if (playSessionRef.current !== sessionId) return;
      setCurrentIndex(i);
      try {
        if (ttsMode === 'cloud') {
          await playAzureTTS(sentences[i], azureRegion, azureKey);
        } else if (ttsMode === 'cloud-save') {
          if (onCloudSave && !cloudSaveRequestedRef.current.has(article.id)) {
            cloudSaveRequestedRef.current.add(article.id);
            try {
              await onCloudSave(article);
            } catch (err) {
              if (!cloudSaveAlertedRef.current) {
                cloudSaveAlertedRef.current = true;
                alert("Cloud save failed. Please connect Cloud Sync first.");
              }
              console.error("Cloud save error:", err);
            }
          }
          await playAzureTTS(sentences[i], azureRegion, azureKey);
        } else if (ttsMode === 'local-service') {
          await speakViaLocalNarrationService(sentences[i]);
        } else {
          await speak(sentences[i], getSelectedVoice(), 1);
        }
      } catch (err: any) {
        if (err && err.name === 'AbortError') {
          setIsPlaying(false);
          return;
        }
        console.error("Long article playback error:", err);
        if (ttsMode === 'cloud' || ttsMode === 'cloud-save') {
          alert("Azure TTS failed. Check Azure Region/Key.");
        } else if (ttsMode === 'local-service') {
          alert("Local narration service failed. Check localhost:3000.");
        }
        setIsPlaying(false);
        return;
      }
      if (playSessionRef.current !== sessionId) return;
      await new Promise(r => setTimeout(r, 250));
    }

    if (playSessionRef.current === sessionId) {
      setIsPlaying(false);
    }
  }, [sentences, getSelectedVoice, ttsMode, azureRegion, azureKey, article.id, onCloudSave, article]);

  const handlePlayPause = () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    playFromIndex(currentIndex);
  };

  const handleSentenceClick = (index: number) => {
    setCurrentIndex(index);
    if (isPlaying) {
      stopPlayback();
      playFromIndex(index);
    }
  };

  const handlePrev = () => {
    const nextIndex = Math.max(0, currentIndex - 1);
    setCurrentIndex(nextIndex);
    if (isPlaying) {
      stopPlayback();
      playFromIndex(nextIndex);
    }
  };

  const handleNext = () => {
    const nextIndex = Math.min(sentences.length - 1, currentIndex + 1);
    setCurrentIndex(nextIndex);
    if (isPlaying) {
      stopPlayback();
      playFromIndex(nextIndex);
    }
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedVoiceName(name);
    localStorage.setItem('tcf-tts-voice', name);
  };

  const handleTtsModeChange = (mode: TtsMode) => {
    setTtsMode(mode);
    localStorage.setItem('tcf-long-tts-mode', mode);
  };

  const handleAzureSave = () => {
    localStorage.setItem('tcf-azure-region', azureRegion);
    localStorage.setItem('tcf-azure-key', azureKey);
  };

  const handleDeleteSentenceRequest = (index: number) => {
    stopPlayback();
    setPendingDeleteIndex(index);
  };

  const handleDeleteSentenceConfirm = () => {
    if (pendingDeleteIndex === null || !onUpdateArticle) return;

    const updatedSentences = sentences.filter((_, index) => index !== pendingDeleteIndex);
    onUpdateArticle({
      id: article.id,
      title: article.title,
      content: updatedSentences.join(' ')
    });
    setPendingDeleteIndex(null);
  };

  const handleDeleteSentenceCancel = () => setPendingDeleteIndex(null);
  const pendingSentence = pendingDeleteIndex !== null ? sentences[pendingDeleteIndex] : null;

  return (
    <>
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 relative">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => { stopPlayback(); onBack(); }} className="flex items-center gap-2 text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="flex items-center gap-2">
          {onStudyFlashcards && (
            <button
              onClick={() => {
                stopPlayback();
                onStudyFlashcards();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-500/30 bg-indigo-600/10 text-indigo-200 hover:bg-indigo-600/20 transition"
              title="Study this article as sequential flashcards"
            >
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">Flashcards</span>
            </button>
          )}
          <div className="relative">
            <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-lg transition ${showVoiceSettings ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <Settings className="w-5 h-5" />
            </button>
            {showVoiceSettings && (
              <div className="absolute right-0 mt-2 w-[90vw] max-w-sm md:w-96 bg-slate-800 rounded-xl border border-slate-700 p-4 z-20 shadow-2xl">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Speech Mode</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleTtsModeChange('local')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition ${ttsMode === 'local' ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/40' : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'}`}
                      >
                        Local
                      </button>
                      <button
                        onClick={() => handleTtsModeChange('cloud')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition ${ttsMode === 'cloud' ? 'bg-cyan-600/30 text-cyan-200 border-cyan-500/40' : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'}`}
                      >
                        Cloud
                      </button>
                      <button
                        onClick={() => handleTtsModeChange('local-service')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition ${ttsMode === 'local-service' ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500/40' : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'}`}
                      >
                        Local Service
                      </button>
                      <button
                        onClick={() => handleTtsModeChange('cloud-save')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition ${ttsMode === 'cloud-save' ? 'bg-sky-600/30 text-sky-200 border-sky-500/40' : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'}`}
                      >
                        Cloud + Save
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Local Voice</label>
                    <select value={selectedVoiceName} onChange={handleVoiceChange} className="mt-2 w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5">
                      {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                    </select>
                  </div>

                  <div className="border-t border-slate-700 pt-4">
                    <label className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Azure Cloud</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input placeholder="Region" value={azureRegion} onChange={e => setAzureRegion(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white" />
                      <input type="password" placeholder="Key" value={azureKey} onChange={e => setAzureKey(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white" />
                      <button onClick={handleAzureSave} className="col-span-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs py-1 rounded">Save Azure</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-white">{article.title}</h2>
        <p className="text-slate-400 text-sm mt-1">{sentences.length} sentences</p>
      </div>

      <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-4 md:p-6 overflow-y-auto no-scrollbar shadow-xl">
        {sentences.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">No content found.</div>
        ) : (
          <div className="space-y-3">
            {sentences.map((sentence, idx) => (
              <div
                key={`${article.id}-${idx}`}
                className={`flex items-start gap-2 p-2 rounded-lg border transition ${idx === currentIndex ? 'bg-indigo-600/10 border-indigo-500/40' : 'bg-slate-900/40 border-slate-700 hover:border-slate-500'}`}
              >
                <button
                  onClick={() => handleSentenceClick(idx)}
                  className={`flex-1 text-left p-2 rounded-lg transition ${idx === currentIndex ? 'text-white' : 'text-slate-300 hover:text-white'}`}
                >
                  <span className="text-xs font-mono text-slate-500 mr-2">{idx + 1}.</span>
                  {sentence}
                </button>
                {onUpdateArticle && (
                  <button
                    onClick={() => handleDeleteSentenceRequest(idx)}
                    className="shrink-0 mt-1 p-2 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition"
                    title="Delete this sentence"
                    aria-label={`Delete sentence ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-slate-900/90 border border-slate-700 rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl backdrop-blur">
          <div className={`flex items-center gap-1 text-xs font-bold uppercase tracking-widest ${
            ttsMode === 'cloud' ? 'text-cyan-300' :
            ttsMode === 'local' ? 'text-indigo-300' :
            ttsMode === 'local-service' ? 'text-emerald-300' :
            'text-sky-300'
          }`}>
            {ttsMode === 'cloud' ? <CloudLightning className="w-3.5 h-3.5" /> :
              ttsMode === 'local' ? <Volume2 className="w-3.5 h-3.5" /> :
              ttsMode === 'local-service' ? <Mic className="w-3.5 h-3.5" /> :
              <CloudUpload className="w-3.5 h-3.5" />}
            {ttsMode === 'cloud' ? 'Cloud' :
              ttsMode === 'local' ? 'Local' :
              ttsMode === 'local-service' ? 'Local Service' :
              'Cloud + Save'}
          </div>
          <div className="w-px h-5 bg-slate-700" />
          <button onClick={handlePrev} disabled={sentences.length === 0} className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40" title="Previous sentence">
            <SkipBack className="w-4 h-4" />
          </button>
          <button onClick={handlePlayPause} disabled={sentences.length === 0} className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg disabled:opacity-40" title="Play / Pause">
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button onClick={stopPlayback} disabled={!isPlaying} className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40" title="Stop">
            <Square className="w-4 h-4" />
          </button>
          <button onClick={handleNext} disabled={sentences.length === 0} className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40" title="Next sentence">
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    <ConfirmModal
      open={pendingDeleteIndex !== null}
      title="Delete Sentence"
      message={pendingSentence ? `Delete this sentence from "${article.title}"?\n\n${pendingSentence}` : 'Delete this sentence?'}
      confirmLabel="Delete Sentence"
      tone="danger"
      onConfirm={handleDeleteSentenceConfirm}
      onCancel={handleDeleteSentenceCancel}
    />
    </>
  );
};
