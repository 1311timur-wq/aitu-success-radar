// Typed view of the original My DU context (src/i18n.js stays plain JS).
import { useApp } from './i18n.js';

export interface AppCtx {
  lang: 'ru' | 'en';
  t: (key: string, vars?: Record<string, string | number>) => string;
  toast: (msg: string) => void;
}

export const useAppCtx = (): AppCtx => useApp() as unknown as AppCtx;
