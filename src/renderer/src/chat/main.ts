import { createApp } from 'vue'
import ChatApp from './ChatApp.vue'
import '../theme.css'
import { createAppI18n } from '../i18n'

const i18n = createAppI18n()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).__PROMPTLY_I18N__ = i18n
window.promptly.onAppLocale((locale) => {
  i18n.global.locale.value = locale as 'en'
})

createApp(ChatApp).use(i18n).mount('#app')
