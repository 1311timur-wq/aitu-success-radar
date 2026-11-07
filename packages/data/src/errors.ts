// One error vocabulary for both apps, mapped from Firebase error codes (see architecture 05, §1).
export type ErrorKind = 'unauthenticated' | 'permission-denied' | 'conflict' | 'invalid' | 'not-found' | 'unavailable' | 'unknown';

export class DataError extends Error {
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind, message?: string, options?: { cause?: unknown }) {
    super(message ?? kind, options);
    this.name = 'DataError';
    this.kind = kind;
  }
}

export function toDataError(e: unknown): DataError {
  if (e instanceof DataError) return e;
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  const kind: ErrorKind =
    code.endsWith('permission-denied') ? 'permission-denied'
      : code.endsWith('unauthenticated') ? 'unauthenticated'
        : code.endsWith('not-found') ? 'not-found'
          : code.endsWith('aborted') || code.endsWith('failed-precondition') ? 'conflict'
            : code.endsWith('invalid-argument') ? 'invalid'
              : code.endsWith('unavailable') || code.endsWith('deadline-exceeded') ? 'unavailable'
                : 'unknown';
  return new DataError(kind, e instanceof Error ? e.message : String(e), { cause: e });
}

/** Result of a chunked write: the UI must show exactly which rows did and did not persist. */
export interface RowsResult {
  committed: string[];
  conflicts: string[];
  failed: { studentUid: string; kind: ErrorKind }[];
}
