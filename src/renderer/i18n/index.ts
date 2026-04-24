import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'

const savedLang = localStorage.getItem('boltberry-lang')
const browserLang = navigator.language.startsWith('de') ? 'de' : 'en'
const defaultLang = savedLang ?? browserLang

i18n
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    lng: defaultLang,
    // English is the source-of-truth locale. Falling back to DE meant
    // English users saw German whenever a key was missing — now a
    // missing-key warning fires instead.
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
