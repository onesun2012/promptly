import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createAppI18n, applyLocale } from './i18n'
import './theme.css'

// Settings window is the light surface (tool surfaces stay dark).
document.documentElement.classList.add('theme-light')

const i18n = createAppI18n()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).__PROMPTLY_I18N__ = i18n
window.promptly.onAppLocale((locale) => {
  applyLocale(locale)
})

createApp(App).use(createPinia()).use(i18n).mount('#app')
