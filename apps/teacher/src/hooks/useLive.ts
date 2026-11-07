import { useEffect, useState } from 'react';
import type { DataError, Live, OnError } from '@aitu/data';

export type LiveState<T> =
  | { status: 'loading'; data: undefined; stale: false; error: null }
  | { status: 'ready'; data: T; stale: boolean; error: null }
  | { status: 'error'; data: undefined; stale: false; error: DataError };

type Watch<A extends unknown[], T> = (...args: [...A, (v: Live<T>) => void, OnError]) => () => void;

/**
 * `useLive(watchSessions, offeringId)` subscribes while mounted and whenever the arguments change;
 * it always unsubscribes on unmount (so sign-out, which unmounts protected screens, detaches every listener).
 */
export function useLive<A extends unknown[], T>(watch: Watch<A, T>, ...args: A): LiveState<T> {
  const key = JSON.stringify(args);
  const [state, setState] = useState<LiveState<T>>({ status: 'loading', data: undefined, stale: false, error: null });
  useEffect(() => {
    setState({ status: 'loading', data: undefined, stale: false, error: null });
    return watch(
      ...args,
      (v: Live<T>) => setState({ status: 'ready', data: v.data, stale: v.fromCache, error: null }),
      (error: Parameters<OnError>[0]) => setState({ status: 'error', data: undefined, stale: false, error }),
    );
    // `key` (serialized args) identifies the subscription; `watch` is a stable module function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, key]);
  return state;
}
