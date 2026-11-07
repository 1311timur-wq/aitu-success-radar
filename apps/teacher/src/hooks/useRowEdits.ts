import { useCallback, useEffect, useState } from 'react';

type Edit<V> = V & {
  /** Server revision the edit is based on; a different live revision means someone else changed the row. */
  baseRevision: number;
  /** Saved; waiting for the live listener to deliver the new revision. */
  syncing: boolean;
};

/**
 * Local, per-row draft editing on top of live server records (attendance sheet, grade sheet).
 * - view(): what the row shows (local edit, else server value, else `empty`)
 * - dirty: edited and different from the server value
 * - conflict: the server revision moved after the teacher started editing that row
 */
export function useRowEdits<R extends { revision: number }, V>(
  records: Map<string, R>,
  toView: (record: R | undefined) => V,
  same: (a: V, b: V) => boolean,
) {
  const [edits, setEdits] = useState<Record<string, Edit<V>>>({});

  useEffect(() => {
    setEdits((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, e] of Object.entries(prev)) {
        if (e.syncing && (records.get(key)?.revision ?? 0) >= e.baseRevision) { delete next[key]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [records]);

  const view = (key: string): V => {
    const e = edits[key];
    if (!e) return toView(records.get(key));
    const { baseRevision: _b, syncing: _s, ...v } = e;
    return v as V;
  };
  const isDirty = (key: string) => {
    const e = edits[key];
    return !!e && !e.syncing && !same(view(key), toView(records.get(key)));
  };
  const isConflict = (key: string) => {
    const e = edits[key];
    return !!e && !e.syncing && (records.get(key)?.revision ?? 0) !== e.baseRevision;
  };
  const baseRevision = (key: string) => edits[key]?.baseRevision ?? records.get(key)?.revision ?? 0;

  const edit = useCallback((key: string, patch: Partial<V>) => {
    setEdits((prev) => {
      const cur = prev[key];
      const base: Edit<V> = cur && !cur.syncing
        ? cur
        : { ...toView(records.get(key)), baseRevision: records.get(key)?.revision ?? 0, syncing: false };
      return { ...prev, [key]: { ...base, ...patch, syncing: false } };
    });
  }, [records, toView]);

  const reset = useCallback((key: string) => setEdits(({ [key]: _drop, ...rest }) => rest), []);
  const clear = useCallback(() => setEdits({}), []);
  const markSaved = useCallback((keys: string[]) => setEdits((prev) => {
    const next = { ...prev };
    for (const k of keys) if (next[k]) next[k] = { ...next[k], baseRevision: next[k].baseRevision + 1, syncing: true };
    return next;
  }), []);

  return { view, isDirty, isConflict, baseRevision, edit, reset, clear, markSaved };
}
