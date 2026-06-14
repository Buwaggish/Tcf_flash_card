import { useState, useEffect } from 'react';
import { saveStudyLog, fetchTodayStudyLog } from '../services/syncService';

export const useStudyTimer = (isConnected: boolean) => {
  const [todayStudyTime, setTodayStudyTime] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [isTimerExpanded, setIsTimerExpanded] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('tcf-study-date');
    if (savedDate === today) {
      setTodayStudyTime(parseInt(localStorage.getItem('tcf-study-time') || '0', 10));
    } else {
      localStorage.setItem('tcf-study-date', today);
      localStorage.setItem('tcf-study-time', '0');
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isTimerPaused) {
        setTodayStudyTime(prev => {
          const next = prev + 1;
          if (next % 10 === 0) localStorage.setItem('tcf-study-time', next.toString());
          if (next % 60 === 0) saveStudyLog(new Date().toISOString().split('T')[0], next);
          return next;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerPaused]);

  useEffect(() => {
    if (!isConnected) return;
    const dateKey = new Date().toISOString().split('T')[0];
    fetchTodayStudyLog(dateKey).then(cloudTime => {
      setTodayStudyTime(prev => {
        const maxTime = Math.max(prev, cloudTime);
        if (maxTime > prev) localStorage.setItem('tcf-study-time', maxTime.toString());
        return maxTime;
      });
    });
  }, [isConnected]);

  useEffect(() => {
    const savedStreak = parseInt(localStorage.getItem('tcf-streak') || '0', 10);
    const lastDate = localStorage.getItem('tcf-last-study-date');
    if (!lastDate) return;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (lastDate === today || lastDate === yesterday) {
      setStreak(savedStreak);
    } else {
      setStreak(0);
      localStorage.setItem('tcf-streak', '0');
    }
  }, []);

  const performResetTimer = () => {
    setTodayStudyTime(0);
    localStorage.setItem('tcf-study-time', '0');
    saveStudyLog(new Date().toISOString().split('T')[0], 0);
  };

  const handleStudyActivity = () => {
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem('tcf-last-study-date');
    if (lastDate === today) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const current = parseInt(localStorage.getItem('tcf-streak') || '0', 10);
    const newStreak = lastDate === yesterday ? current + 1 : 1;
    setStreak(newStreak);
    localStorage.setItem('tcf-streak', newStreak.toString());
    localStorage.setItem('tcf-last-study-date', today);
  };

  return {
    todayStudyTime,
    isTimerPaused,
    isTimerExpanded,
    streak,
    toggleTimerPause: () => setIsTimerPaused(prev => !prev),
    toggleTimerExpanded: () => setIsTimerExpanded(prev => !prev),
    performResetTimer,
    handleStudyActivity,
  };
};
