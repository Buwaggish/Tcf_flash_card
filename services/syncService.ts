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

export const isConfigured = () => !!supabase;

/**
 * Merges two datasets. 
 * Strategy: Union of Categories (by ID or Name), Units (by ID or Name), and Cards (by ID or Content).
 */
const mergeData = (local: AppData, remote: AppData): AppData => {
  const merged = [...local];

  remote.forEach(remoteCat => {
    // 1. Match Category by ID first
    let localCatIndex = merged.findIndex(c => c.id === remoteCat.id);
    
    // 2. If ID mismatch, fallback to Name matching (case-insensitive)
    // This prevents duplicate "Compréhension Orale" when connecting a new device
    if (localCatIndex === -1) {
        localCatIndex = merged.findIndex(c => c.name.trim().toLowerCase() === remoteCat.name.trim().toLowerCase());
    }

    if (localCatIndex === -1) {
      // Category doesn't exist locally, add it
      merged.push(remoteCat);
    } else {
      // Category exists, merge units
      const localCat = merged[localCatIndex];
      const mergedUnits = [...localCat.units];

      remoteCat.units.forEach(remoteUnit => {
        // 3. Match Unit by ID first
        let localUnitIndex = mergedUnits.findIndex(u => u.id === remoteUnit.id);
        
        // 4. If ID mismatch, fallback to Name matching
        if (localUnitIndex === -1) {
             localUnitIndex = mergedUnits.findIndex(u => u.name.trim().toLowerCase() === remoteUnit.name.trim().toLowerCase());
        }

        if (localUnitIndex === -1) {
          // Unit doesn't exist locally, add it
          mergedUnits.push(remoteUnit);
        } else {
          // Unit exists, merge cards
          const localUnit = mergedUnits[localUnitIndex];
          const mergedCards = [...localUnit.cards];

          remoteUnit.cards.forEach(remoteCard => {
             // 5. Match Card by ID
            const existsById = mergedCards.some(c => c.id === remoteCard.id);
            
            if (!existsById) {
                 // 6. Secondary check: Avoid duplicate content (Same Front & Back)
                 // This prevents duplicates if the same JSON was imported on two devices separately
                 const existsByContent = mergedCards.some(c => 
                     c.front === remoteCard.front && c.back === remoteCard.back
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

// Pulls remote, merges with local, and updates remote. Used on App Start.
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
    }

    // 3. Upload Final Merged Data (Upsert)
    // This ensures that even if we just merged down, we update the cloud to match the unified state
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

// Simply pushes the current local state to the cloud. Used when user edits data (Import/Delete).
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

/**
 * Deep Cleaning Function
 * Merges categories with same name, units with same name, and removes identical cards.
 */
export const consolidateData = (data: AppData): AppData => {
  const categoriesMap = new Map<string, Category>();

  data.forEach(cat => {
    const key = cat.name.trim().toLowerCase();
    if (!categoriesMap.has(key)) {
      // Clone to avoid mutation issues
      categoriesMap.set(key, { ...cat, units: [...cat.units] });
    } else {
      // Merge units
      const existing = categoriesMap.get(key)!;
      existing.units.push(...cat.units);
    }
  });

  const cleanedCategories: Category[] = Array.from(categoriesMap.values()).map(cat => {
    // Deduplicate Units within Category
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
      // Deduplicate Cards within Unit
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