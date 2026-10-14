import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';

export const defaultNS = 'translation';
export const resources = { en: { translation: en } } as const;
export const SUPPORTED_LANGUAGES = ['en'] as const;
export const FALLBACK_LANGUAGE = 'en';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}

export function pickLanguage(languageCodes: readonly (string | null | undefined)[]): string {
  const supported: readonly string[] = SUPPORTED_LANGUAGES;
  return languageCodes.find((code) => code && supported.includes(code)) ?? FALLBACK_LANGUAGE;
}

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  lng: FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  defaultNS,
  resources,
  initAsync: false,
  interpolation: { escapeValue: false },
});
