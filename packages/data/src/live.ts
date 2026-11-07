import { onSnapshot, type DocumentReference, type DocumentSnapshot, type Query, type QueryDocumentSnapshot, type Unsubscribe } from 'firebase/firestore';
import { toDataError, type DataError } from './errors.ts';

export interface Live<T> {
  data: T;
  /** True while the data comes from the local cache only (offline / reconnecting): show "may be outdated". */
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export type OnError = (e: DataError) => void;

export function watchQuery<T>(q: Query, map: (s: QueryDocumentSnapshot) => T, next: (v: Live<T[]>) => void, onError: OnError): Unsubscribe {
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    next({ data: snap.docs.map(map), fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites });
  }, (e) => onError(toDataError(e)));
}

export function watchDoc<T>(ref: DocumentReference, map: (s: DocumentSnapshot) => T, next: (v: Live<T | null>) => void, onError: OnError): Unsubscribe {
  return onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    next({ data: snap.exists() ? map(snap) : null, fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites });
  }, (e) => onError(toDataError(e)));
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
