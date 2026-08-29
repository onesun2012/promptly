import { createI18n } from 'vue-i18n'
import en from './en.json'
import fr from './fr.json'
import de from './de.json'
import es from './es.json'
import ja from './ja.json'
import ko from './ko.json'

export const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'ja', 'ko'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

type MessageSchema = typeof en
const messages: Record<Locale, MessageSchema> = { en, fr, de, es, ja, ko }

/** Reads ?locale= from the window URL (main passes it at load time). */
export function localeFromUrl(): Locale {
  const q = new URLSearchParams(window.location.search).get('locale')
  return (SUPPORTED_LOCALES as readonly string[]).includes(q ?? '') ? (q as Locale) : 'en'
}

export function createAppI18n() {
  return createI18n({
    legacy: false,
    locale: localeFromUrl(),
    fallbackLocale: 'en',
    messages
  })
}

export function applyLocale(locale: string): void {
  if ((SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__PROMPTLY_I18N__.global.locale.value = locale
  }
}
