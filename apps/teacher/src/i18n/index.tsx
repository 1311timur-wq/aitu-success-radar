import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ru, type MessageKey } from './ru.ts';
import { en } from './en.ts';

export type Lang = 'ru' | 'en';
type Vars = Record<string, string | number>;
export type T = (key: MessageKey, vars?: Vars) => string;

const DICTS = { ru, en } as const;
const STORAGE_KEY = 'aitu.teacher.lang';

interface I18nValue { lang: Lang; setLang: (l: Lang) => void; t: T; locale: string }
const I18nContext = createContext<I18nValue | null>(null);

function readLang(): Lang {
  try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ru'; } catch { return 'ru'; }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* private mode */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = useCallback<T>((key, vars) => {
    const template: string = DICTS[lang][key] ?? ru[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : template;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t, locale: lang === 'ru' ? 'ru-RU' : 'en-GB' }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}

export type { MessageKey };
