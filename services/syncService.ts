import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppData, Category, Unit, Flashcard } from '../types';

let supabase: SupabaseClient | null = null;

// Constants
const TABLE_NAME = 'tcf_sync';
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

/**
 * Merges two datasets. 
 * Strategy: Union of Categories, Units, and Cards by ID.
 * Local updates might be overwritten if we don't track timestamps, 
 * but for flashcards, union is usually safest to avoid data loss.
 */
const mergeData = (local: AppData, remote: AppData): AppData => {
  const merged = [...local];

  remote.forEach(remoteCat => {
    const localCatIndex = merged.findIndex(c => c.id === remoteCat.id);
    
    if (localCatIndex === -1) {
      // Category doesn't exist locally, add it
      merged.push(remoteCat);
    } else {
      // Category exists, merge units
      const localCat = merged[localCatIndex];
      const mergedUnits = [...localCat.units];

      remoteCat.units.forEach(remoteUnit => {
        const localUnitIndex = mergedUnits.findIndex(u => u.id === remoteUnit.id);

        if (localUnitIndex === -1) {
          // Unit doesn't exist locally, add it
          mergedUnits.push(remoteUnit);
        } else {
          // Unit exists, merge cards
          const localUnit = mergedUnits[localUnitIndex];
          const mergedCards = [...localUnit.cards];

          remoteUnit.cards.forEach(remoteCard => {
            if (!mergedCards.find(c => c.id === remoteCard.id)) {
               mergedCards.push(remoteCard);
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

export const syncData = async (localData: AppData): Promise<{ success: boolean; data?: AppData; error?: string }> => {
  if (!supabase) return { success: false, error: "Not connected" };

  try {
    // 1. Fetch Remote Data
    const { data: remoteRows, error: fetchError } = await supabase
      .from(TABLE_NAME)
      .select('content')
      .eq('id', ROW_ID)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "Row not found"
      throw fetchError;
    }

    let finalData = localData;
    let remoteData: AppData = [];

    // 2. Determine Merge Strategy
    if (remoteRows && remoteRows.content) {
      remoteData = remoteRows.content as AppData;
      // Merge Remote into Local
      finalData = mergeData(localData, remoteData);
    } else {
        // Remote is empty, so we just upload local (Migration scenario)
        console.log("Remote empty, migrating local data to cloud.");
    }

    // 3. Upload Final Merged Data (Upsert)
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
