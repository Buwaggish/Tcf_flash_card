import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppData, Category, Unit, Flashcard } from '../types';

let supabase: SupabaseClient | null = null;

// Constants
const TABLE_NAME = 'tcf_sync';
const LOG_TABLE_NAME = 'study_logs';
const ROW_ID = 1; // Single row for simple personal sync

export interface SyncConfig {
  url: string;
  key: string;
}

export const initSupabase = (config: SyncConfig) => {
  try {
    supabase = createClient(config.url, config.key);
    return true;
  } catch (e) {
    console.error("Failed to init supabase", e);
    return false;
  }
};

export const isConfigured = () => !!supabase;

/**
 * Gets the total card count from an AppData object
 */
export const getCardCount = (data: AppData): number => {
  return data.reduce((acc, cat) => acc + cat.units.reduce((uAcc, unit) => uAcc + unit.cards.length, 0), 0);
};

/**
 * Peek at the cloud data to get its card count without full sync implications
 */
export const fetchCloudCount = async (): Promise<number | null> => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('content')
            .eq('id', ROW_ID)
            .single();
        
        if (error || !data) return null;
        return getCardCount(data.content as AppData);
    } catch (e) {
        return null;
    }
};

/**
 * Saves daily study duration to Supabase
 */
export const saveStudyLog = async (date: string, durationSeconds: number): Promise<void> => {
    if (!supabase) return;
    try {
        await supabase
            .from(LOG_TABLE_NAME)
            .upsert({ date_id: date, duration: durationSeconds, updated_at: new Date() }, { onConflict: 'date_id' });
    } catch (e) {
        console.error("Failed to save study log", e);
    }
};

/**
 * Fetches daily study duration from Supabase
 */
export const fetchTodayStudyLog = async (date: string): Promise<number> => {
    if (!supabase) return 0;
    try {
        const { data, error } = await supabase
            .from(LOG_TABLE_NAME)
            .select('duration')
            .eq('date_id', date)
            .single();
        
        if (error || !data) return 0;
        return data.duration || 0;
    } catch (e) {
        // It's normal to have no log for a new day
        return 0;
    }
};

/**
 * Merges two datasets. 
 */
const mergeData = (local: AppData, remote: AppData): AppData => {
  const merged = [...local];

  remote.forEach(remoteCat => {
    let localCatIndex = merged.findIndex(c => c.id === remoteCat.id);
    if (localCatIndex === -1) {
        localCatIndex = merged.findIndex(c => c.name.trim().toLowerCase() === remoteCat.name.trim().toLowerCase());
    }

    if (localCatIndex === -1) {
      merged.push(remoteCat);
    } else {
      const localCat = merged[localCatIndex];
      const mergedUnits = [...localCat.units];

      remoteCat.units.forEach(remoteUnit => {
        let localUnitIndex = mergedUnits.findIndex(u => u.id === remoteUnit.id);
        if (localUnitIndex === -1) {
             localUnitIndex = mergedUnits.findIndex(u => u.name.trim().toLowerCase() === remoteUnit.name.trim().toLowerCase());
        }

        if (localUnitIndex === -1) {
          mergedUnits.push(remoteUnit);
        } else {
          const localUnit = mergedUnits[localUnitIndex];
          const mergedCards = [...localUnit.cards];

          remoteUnit.cards.forEach(remoteCard => {
            const existsById = mergedCards.some(c => c.id === remoteCard.id);
            if (!existsById) {
                 const existsByContent = mergedCards.some(c => 
                     c.front.trim() === remoteCard.front.trim() && 
                     c.back.trim() === remoteCard.back.trim()
                 );
                 if (!existsByContent) {
                     mergedCards.push(remoteCard);
                 }
            }
          });
          mergedUnits[localUnitIndex] = { ...localUnit, cards: mergedCards };
        }
      });
      merged[localCatIndex] = { ...localCat, units: mergedUnits };
    }
  });
  return merged;
};

// Pulls remote and prefers cloud data when present. Used on App Start or Force Sync.
export const syncData = async (localData: AppData): Promise<{ success: boolean; data?: AppData; error?: string }> => {
  if (!supabase) return { success: false, error: "Not connected" };

  try {
    const { data: remoteRows, error: fetchError } = await supabase
      .from(TABLE_NAME)
      .select('content')
      .eq('id', ROW_ID)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    let finalData = localData;
    let remoteData: AppData = [];

    if (remoteRows && remoteRows.content) {
      remoteData = remoteRows.content as AppData;
      const remoteHasItems = getCardCount(remoteData) > 0;
      finalData = remoteHasItems ? remoteData : localData;
    }

    const { error: upsertError } = await supabase
      .from(TABLE_NAME)
      .upsert({ id: ROW_ID, content: finalData, updated_at: new Date() });

    if (upsertError) throw upsertError;

    return { success: true, data: finalData };

  } catch (err: any) {
    console.error("Sync Error:", err);
    return { success: false, error: err.message || "Unknown sync error" };
  }
};

export const pushData = async (data: AppData): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: "Not connected" };
  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert({ id: ROW_ID, content: data, updated_at: new Date() });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error("Push Error:", err);
    return { success: false, error: err.message };
  }
};

export const consolidateData = (data: AppData): AppData => {
  const categoriesMap = new Map<string, Category>();

  data.forEach(cat => {
    const key = cat.name.trim().toLowerCase();
    if (!categoriesMap.has(key)) {
      categoriesMap.set(key, { ...cat, units: [...cat.units] });
    } else {
      const existing = categoriesMap.get(key)!;
      existing.units.push(...cat.units);
    }
  });

  const cleanedCategories: Category[] = Array.from(categoriesMap.values()).map(cat => {
    const unitsMap = new Map<string, Unit>();
    cat.units.forEach(unit => {
      const key = unit.name.trim().toLowerCase();
      if (!unitsMap.has(key)) {
        unitsMap.set(key, { ...unit, cards: [...unit.cards] });
      } else {
        const existing = unitsMap.get(key)!;
        existing.cards.push(...unit.cards);
      }
    });

    const cleanedUnits: Unit[] = Array.from(unitsMap.values()).map(unit => {
      const uniqueCards: Flashcard[] = [];
      const seenCards = new Set<string>();
      unit.cards.forEach(card => {
        const contentKey = `${card.front.trim()}|${card.back.trim()}`;
        if (!seenCards.has(contentKey)) {
          seenCards.add(contentKey);
          uniqueCards.push(card);
        }
      });
      return { ...unit, cards: uniqueCards };
    });
    return { ...cat, units: cleanedUnits };
  });
  return cleanedCategories;
};
