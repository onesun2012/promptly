import { createI18n } from 'vue-i18n'
import en from './en.json'
import fr from './fr.json'
import de from './de.json'
import es from './es.json'
import ja from './ja.json'
import ko from './ko.json'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import ru from './ru.json'
import ar from './ar.json'

export const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'ja', 'ko', 'zh-CN', 'zh-TW', 'ru', 'ar'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** Native names for the settings dropdown (always shown in their own language). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ja: '日本語',
  ko: '한국어',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ru: 'Русский',
  ar: 'العربية'
}

const RTL_LOCALES: readonly string[] = ['ar']

type MessageSchema = typeof en
const messages: Record<Locale, MessageSchema> = { en, fr, de, es, ja, ko, 'zh-CN': zhCN, 'zh-TW': zhTW, ru, ar }

function applyDir(locale: string): void {
  document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr'
}

/** Reads ?locale= from the window URL (main passes it at load time). */
export function localeFromUrl(): Locale {
  const q = new URLSearchParams(window.location.search).get('locale')
  return (SUPPORTED_LOCALES as readonly string[]).includes(q ?? '') ? (q as Locale) : 'en'
}

export function createAppI18n() {
  applyDir(localeFromUrl())
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
    applyDir(locale)
  }
}
