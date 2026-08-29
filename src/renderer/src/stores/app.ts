import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppInfo } from '@shared'

export const useAppStore = defineStore('app', () => {
  const info = ref<AppInfo | null>(null)
  const loaded = ref(false)

  async function load(): Promise<void> {
    info.value = await window.promptly.getAppInfo()
    loaded.value = true
  }

  return { info, loaded, load }
})
