import i18next from 'i18next';
import en from './locales/en.json' with { type: 'json' };

export const defaultNS = 'translation';
export const resources = { en: { translation: en } } as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}

export const i18n = i18next.createInstance();

void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  defaultNS,
  resources,
  initAsync: false,
  interpolation: { escapeValue: false },
});

export const t = i18n.t.bind(i18n);
