import type { DataError, ErrorKind } from '@aitu/data';
import type { MessageKey } from './i18n/index.tsx';

export function errorKey(e: DataError | { kind: ErrorKind } | null | undefined): MessageKey {
  switch (e?.kind) {
    case 'permission-denied': case 'not-found': return 'noAccess';
    case 'unavailable': return 'errNetwork';
    case 'conflict': return 'conflict';
    default: return 'errGeneric';
  }
}

export function authErrorKey(e: unknown): MessageKey {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-email')) return 'errWrongCredentials';
  if (code.includes('too-many-requests')) return 'errTooMany';
  if (code.includes('network-request-failed')) return 'errNetwork';
  return 'errGeneric';
}
