import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppData, Category, Unit, Flashcard } from '../types';

let supabase: SupabaseClient | null = null;

// Constants
const LEGACY_TABLE_NAME = 'tcf_sync';
const LOG_TABLE_NAME = 'study_logs';
const ROW_ID = 1; // Single row for legacy sync

const CATEGORY_TABLE = 'tcf_categories';
const UNIT_TABLE = 'tcf_units';
const CARD_TABLE = 'tcf_cards';
const META_TABLE = 'tcf_sync_meta';
const META_KEY = 'current_snapshot';

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

const hasCards = (data: AppData): boolean => getCardCount(data) > 0;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

const upsertBatches = async (table: string, rows: any[], batchSize: number) => {
    if (!supabase) throw new Error("Not connected");
    const batches = chunkArray(rows, batchSize);
    for (const batch of batches) {
        const { error } = await supabase.from(table).upsert(batch);
        if (error) throw error;
    }
};

const fetchLegacyData = async (): Promise<AppData | null> => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase
            .from(LEGACY_TABLE_NAME)
            .select('content')
            .eq('id', ROW_ID)
            .single();

        if (error || !data?.content) return null;
        return data.content as AppData;
    } catch (e) {
        return null;
    }
};

const getSnapshotFromMeta = async (): Promise<string | null> => {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase
            .from(META_TABLE)
            .select('value')
            .eq('key', META_KEY)
            .single();

        if (error || !data?.value) return null;
        return data.value as string;
    } catch (e) {
        return null;
    }
};

const resolveSnapshotId = async (): Promise<string | null> => {
    const metaSnapshot = await getSnapshotFromMeta();
    if (metaSnapshot) return metaSnapshot;
    if (!supabase) return null;

    try {
        const { data: catRow } = await supabase
            .from(CATEGORY_TABLE)
            .select('snapshot_id, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        if (catRow?.snapshot_id) return catRow.snapshot_id as string;
    } catch (e) {
        // ignore and fall back
    }

    try {
        const { data: unitRow } = await supabase
            .from(UNIT_TABLE)
            .select('snapshot_id, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        if (unitRow?.snapshot_id) return unitRow.snapshot_id as string;
    } catch (e) {
        // ignore and fall back
    }

    try {
        const { data: cardRow } = await supabase
            .from(CARD_TABLE)
            .select('snapshot_id, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        if (cardRow?.snapshot_id) return cardRow.snapshot_id as string;
    } catch (e) {
        // ignore and fall back
    }

    return null;
};

const fetchAllRows = async (
    table: string,
    select: string,
    snapshotId: string,
    batchSize: number = 1000
): Promise<any[]> => {
    if (!supabase) return [];
    const rows: any[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select(select)
            .eq('snapshot_id', snapshotId)
            .order('id', { ascending: true })
            .range(from, from + batchSize - 1);

        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < batchSize) break;
        from += batchSize;
    }
    return rows;
};

const fetchSnapshotData = async (snapshotId: string): Promise<AppData> => {
    if (!supabase) return [];

    const categories = await fetchAllRows(
        CATEGORY_TABLE,
        'id, name, snapshot_id',
        snapshotId,
        500
    );

    if (!categories || categories.length === 0) return [];

    const units = await fetchAllRows(
        UNIT_TABLE,
        'id, name, category_id, snapshot_id',
        snapshotId,
        1000
    );

    const cards = await fetchAllRows(
        CARD_TABLE,
        'id, unit_id, front, back, mastered, srs, snapshot_id',
        snapshotId,
        1000
    );

    const cardsByUnit = new Map<string, Flashcard[]>();
    (cards || []).forEach(card => {
        const list = cardsByUnit.get(card.unit_id as string) || [];
        list.push({
            id: card.id as string,
            front: card.front as string,
            back: card.back as string,
            mastered: Boolean(card.mastered),
            srs: (card.srs as Flashcard['srs']) || undefined
        });
        cardsByUnit.set(card.unit_id as string, list);
    });

    const unitsByCategory = new Map<string, Unit[]>();
    (units || []).forEach(unit => {
        const list = unitsByCategory.get(unit.category_id as string) || [];
        list.push({
            id: unit.id as string,
            name: unit.name as string,
            cards: cardsByUnit.get(unit.id as string) || []
        });
        unitsByCategory.set(unit.category_id as string, list);
    });

    return (categories || []).map(cat => ({
        id: cat.id as string,
        name: cat.name as string,
        units: unitsByCategory.get(cat.id as string) || []
    }));
};

const writeSnapshotData = async (data: AppData): Promise<void> => {
    if (!supabase) throw new Error("Not connected");

    const snapshotId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const updatedAt = new Date();

    const categories = data.map(cat => ({
        id: cat.id,
        name: cat.name,
        snapshot_id: snapshotId,
        updated_at: updatedAt
    }));

    const units = data.flatMap(cat =>
        cat.units.map(unit => ({
            id: unit.id,
            category_id: cat.id,
            name: unit.name,
            snapshot_id: snapshotId,
            updated_at: updatedAt
        }))
    );

    const cards = data.flatMap(cat =>
        cat.units.flatMap(unit =>
            unit.cards.map(card => ({
                id: card.id,
                unit_id: unit.id,
                front: card.front,
                back: card.back,
                mastered: card.mastered,
                srs: card.srs ?? null,
                snapshot_id: snapshotId,
                updated_at: updatedAt
            }))
        )
    );

    if (categories.length > 0) {
        await upsertBatches(CATEGORY_TABLE, categories, 500);
    }

    if (units.length > 0) {
        await upsertBatches(UNIT_TABLE, units, 500);
    }

    if (cards.length > 0) {
        await upsertBatches(CARD_TABLE, cards, 500);
    }

    const { error: metaError } = await supabase
        .from(META_TABLE)
        .upsert({ key: META_KEY, value: snapshotId, updated_at: updatedAt });
    if (metaError) throw metaError;

    // Best-effort cleanup of older snapshots to avoid bloat.
    await supabase.from(CATEGORY_TABLE).delete().neq('snapshot_id', snapshotId);
    await supabase.from(UNIT_TABLE).delete().neq('snapshot_id', snapshotId);
    await supabase.from(CARD_TABLE).delete().neq('snapshot_id', snapshotId);
};

const migrateLegacyIfNeeded = async (): Promise<AppData | null> => {
    if (!supabase) return null;

    const snapshotId = await resolveSnapshotId();
    if (snapshotId) return null;

    try {
        const { count: cardCount } = await supabase
            .from(CARD_TABLE)
            .select('id', { count: 'exact', head: true });

        if ((cardCount || 0) > 0) return null;

        const { count: categoryCount } = await supabase
            .from(CATEGORY_TABLE)
            .select('id', { count: 'exact', head: true });

        if ((categoryCount || 0) > 0) return null;
    } catch (e) {
        // If table missing or count fails, don't attempt migration.
        return null;
    }

    const legacy = await fetchLegacyData();
    if (!legacy || !hasCards(legacy)) return null;

    await writeSnapshotData(legacy);
    return legacy;
};

/**
 * Peek at the cloud data to get its card count without full sync implications
 */
export const fetchCloudCount = async (): Promise<number | null> => {
    if (!supabase) return null;
    try {
        await migrateLegacyIfNeeded();
        const snapshotId = await resolveSnapshotId();
        if (!snapshotId) {
            const legacy = await fetchLegacyData();
            return legacy ? getCardCount(legacy) : null;
        }

        const { count, error } = await supabase
            .from(CARD_TABLE)
            .select('id', { count: 'exact', head: true })
            .eq('snapshot_id', snapshotId);

        if (error) return null;
        if ((count ?? 0) > 0) return count ?? 0;

        const legacy = await fetchLegacyData();
        return legacy ? getCardCount(legacy) : count ?? 0;
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
    const migrated = await migrateLegacyIfNeeded();
    if (migrated) {
        return { success: true, data: migrated };
    }

    let finalData = localData;
    const snapshotId = await resolveSnapshotId();

    if (snapshotId) {
        const remoteData = await fetchSnapshotData(snapshotId);
        if (hasCards(remoteData)) {
            finalData = remoteData;
        } else {
            const legacy = await fetchLegacyData();
            if (legacy && hasCards(legacy)) {
                await writeSnapshotData(legacy);
                finalData = legacy;
            } else {
                finalData = localData;
            }
        }
    }

    await writeSnapshotData(finalData);
    return { success: true, data: finalData };

  } catch (err: any) {
    console.error("Sync Error:", err);
    return { success: false, error: err.message || "Unknown sync error" };
  }
};

// Pulls remote without pushing; prefers cloud data when present.
export const pullData = async (localData: AppData): Promise<{ success: boolean; data?: AppData; error?: string }> => {
  if (!supabase) return { success: false, error: "Not connected" };

  try {
    const migrated = await migrateLegacyIfNeeded();
    if (migrated) {
        return { success: true, data: migrated };
    }

    const snapshotId = await resolveSnapshotId();
    if (!snapshotId) {
        const legacy = await fetchLegacyData();
        if (legacy && hasCards(legacy)) {
            await writeSnapshotData(legacy);
            return { success: true, data: legacy };
        }
        return { success: true, data: localData };
    }

    const remoteData = await fetchSnapshotData(snapshotId);
    let finalData = localData;
    if (hasCards(remoteData)) {
        finalData = remoteData;
    } else {
        const legacy = await fetchLegacyData();
        if (legacy && hasCards(legacy)) {
            await writeSnapshotData(legacy);
            finalData = legacy;
        }
    }
    return { success: true, data: finalData };
  } catch (err: any) {
    console.error("Pull Error:", err);
    return { success: false, error: err.message || "Unknown pull error" };
  }
};

export const pushData = async (data: AppData): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: "Not connected" };
  try {
    await writeSnapshotData(data);
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
