import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';
import zhCn from './zh-cn.json';

export type AppLanguage = 'en' | 'zh-CN' | 'fr';

export const DEFAULT_LANGUAGE: AppLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'i18nextLng';

/** Supported app language codes in the order shown by language pickers. */
export const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'fr'] as const;

/** Hardcoded language options for the user-facing language setting. */
export const LANGUAGE_OPTIONS: Array<{
  label: string;
  value: AppLanguage;
}> = [
  { label: 'English', value: 'en' },
  { label: '简体中文', value: 'zh-CN' },
  { label: 'Français', value: 'fr' },
];

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  'zh-CN': { translation: zhCn },
} as const;

/** Normalize browser or stored language tags to an app-supported language. */
export function normalizeLanguage(value: unknown): AppLanguage {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE;

  const language = value.trim().replace('_', '-').toLowerCase();
  if (language.startsWith('zh')) return 'zh-CN';
  if (language.startsWith('fr')) return 'fr';
  if (language.startsWith('en')) return 'en';

  return DEFAULT_LANGUAGE;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    detection: {
      caches: ['localStorage'],
      convertDetectedLanguage: normalizeLanguage,
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      order: ['localStorage', 'navigator'],
    },
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    keySeparator: false,
    resources,
    supportedLngs: SUPPORTED_LANGUAGES,
  });

export { i18n };
