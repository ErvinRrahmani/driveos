import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

export const defaultNS = 'translation';
export const resources = { en: { translation: en } } as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  defaultNS,
  resources,
  initAsync: false,
  interpolation: { escapeValue: false },
});
