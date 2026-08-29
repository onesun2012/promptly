<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from './stores/app'
import type { LifecycleInfo, PipelineEvent } from '@shared'
import type { ProviderProfile, ProviderView, TestConnectionResult } from '@shared'
import { SUPPORTED_LOCALES, applyLocale, type Locale } from './i18n'

const app = useAppStore()
const { t, locale } = useI18n()

const lastEvent = ref<PipelineEvent | null>(null)
const eventCount = ref(0)
const lifecycle = ref<LifecycleInfo | null>(null)
let offEvent: (() => void) | null = null
let offLifecycle: (() => void) | null = null
let offLocale: (() => void) | null = null

const locales: Locale[] = [...SUPPORTED_LOCALES]
const form = ref<ProviderProfile>({
  id: '',
  name: 'My provider',
  protocol: 'openai',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: ''
})
const profiles = ref<ProviderView[]>([])
const activeId = ref<string | null>(null)
const testing = ref(false)
const testResult = ref<TestConnectionResult | null>(null)
const saveMsg = ref('')
const settingsLanguage = ref('en')
const autostart = ref(true)

async function refreshProfiles(): Promise<void> {
  profiles.value = await window.promptly.listProviders()
  const active = await window.promptly.activeProvider()
  activeId.value = active?.id ?? null
  if (active) {
    form.value = { ...active, apiKey: '' }
  }
}

async function loadSettings(): Promise<void> {
  const s = await window.promptly.getSettings()
  settingsLanguage.value = s.language
  autostart.value = s.autostart
}

async function onLanguageChange(): Promise<void> {
  locale.value = settingsLanguage.value as Locale
  await window.promptly.setLanguage(settingsLanguage.value)
}

async function onAutostartChange(): Promise<void> {
  await window.promptly.setAutostart(autostart.value)
}

async function testProvider(): Promise<void> {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await window.promptly.testProvider({ ...form.value })
  } finally {
    testing.value = false
  }
}

async function saveProvider(): Promise<void> {
  if (!form.value.id) form.value.id = 'p_' + Date.now().toString(36)
  const r = await window.promptly.saveProvider({ ...form.value })
  saveMsg.value = r.ok ? t('app.savedOk') : t('app.saveFailed')
  await refreshProfiles()
}

async function makeActive(id: string): Promise<void> {
  await window.promptly.setActiveProvider(id)
  activeId.value = id
}

async function removeProvider(id: string): Promise<void> {
  await window.promptly.deleteProvider(id)
  await refreshProfiles()
}

function openChat(): void {
  window.promptly.openChat()
}

onMounted(() => {
  void app.load()
  void refreshProfiles()
  void loadSettings()
  offEvent = window.promptly.onPipelineEvent((env) => {
    lastEvent.value = env
    eventCount.value += 1
  })
  offLifecycle = window.promptly.onPipelineLifecycle((info) => {
    lifecycle.value = info
  })
  offLocale = window.promptly.onAppLocale((l) => {
    applyLocale(l)
    locale.value = l as Locale
  })
})

onUnmounted(() => {
  offEvent?.()
  offLifecycle?.()
  offLocale?.()
})

function snippet(env: PipelineEvent | null): string {
  if (!env) return ''
  const text = env.payload['text']
  if (typeof text !== 'string') return JSON.stringify(env.payload).slice(0, 120)
  return text.length > 120 ? text.slice(0, 120) + '…' : text
}
</script>

<template>
  <div class="shell">
    <header class="brand">
      <h1>Promptly</h1>
      <p class="tagline">
        {{ t('app.tagline') }}
      </p>
    </header>

    <main class="card">
      <template v-if="app.loaded && app.info">
        <h2>{{ t('app.providers') }}</h2>
        <ul class="meta">
          <li>
            <span>{{ t('app.about') }}</span>
            <code>{{ app.info.name }} v{{ app.info.version }}</code>
          </li>
          <li>
            <span>{{ t('app.helper') }}</span>
            <code>{{ lifecycle ? lifecycle.state : '…' }}</code>
          </li>
          <li>
            <span>{{ t('app.events') }}</span>
            <code>{{ eventCount }}</code>
          </li>
        </ul>
      </template>
      <p v-else>
        Loading…
      </p>
    </main>

    <section class="card">
      <h2>{{ t('app.providerLab') }}</h2>
      <div class="grid">
        <label>
          {{ t('app.protocol') }}
          <select v-model="form.protocol">
            <option value="openai">{{ t('app.openaiCompatible') }}</option>
            <option value="anthropic">{{ t('app.anthropic') }}</option>
            <option value="gemini">{{ t('app.gemini') }}</option>
          </select>
        </label>
        <label>
          {{ t('app.baseUrl') }}
          <input
            v-model="form.baseUrl"
            spellcheck="false"
          >
        </label>
        <label>
          {{ t('app.apiKey') }}
          <input
            v-model="form.apiKey"
            type="password"
            spellcheck="false"
            placeholder="sk-…"
          >
        </label>
        <label>
          {{ t('app.model') }}
          <input
            v-model="form.model"
            spellcheck="false"
            :placeholder="t('app.modelPlaceholder')"
          >
        </label>
      </div>
      <div class="actions">
        <button
          class="primary"
          :disabled="testing"
          @click="testProvider"
        >
          {{ testing ? t('app.testing') : t('app.testConnection') }}
        </button>
        <button @click="saveProvider">
          {{ t('app.save') }}
        </button>
        <span
          v-if="saveMsg"
          class="muted"
        >{{ saveMsg }}</span>
      </div>
      <div
        v-if="testResult"
        class="result"
        :class="testResult.ok ? 'ok' : 'bad'"
      >
        <template v-if="testResult.ok">
          ✓ {{ t('app.connected', { ms: testResult.latencyMs, count: testResult.models?.length ?? 0 }) }}
          <div class="muted">
            {{ t('app.sample', { reply: testResult.sampleReply }) }}
          </div>
        </template>
        <template v-else>
          ✗ {{ testResult.error }}
        </template>
      </div>

      <div
        v-if="profiles.length"
        class="saved"
      >
        <h3>{{ t('app.savedProfiles') }}</h3>
        <ul>
          <li
            v-for="p in profiles"
            :key="p.id"
          >
            <label class="row">
              <input
                type="radio"
                name="active"
                :checked="p.id === activeId"
                @change="makeActive(p.id)"
              >
              <span class="pname">{{ p.name }}</span>
              <code>{{ p.protocol }}</code>
              <code class="muted">{{ p.baseUrl }}</code>
              <span
                v-if="p.insecureKey"
                class="warn"
                :title="t('app.plainKeyWarn')"
              >⚠</span>
              <button
                class="mini"
                @click="removeProvider(p.id)"
              >✕</button>
            </label>
          </li>
        </ul>
      </div>
    </section>

    <section class="card">
      <h2>{{ t('app.settings') }}</h2>
      <div class="grid">
        <label>
          {{ t('app.language') }}
          <select
            v-model="settingsLanguage"
            @change="onLanguageChange"
          >
            <option
              v-for="l in locales"
              :key="l"
              :value="l"
            >{{ l.toUpperCase() }}</option>
          </select>
        </label>
        <label class="check">
          <input
            v-model="autostart"
            type="checkbox"
            @change="onAutostartChange"
          >
          {{ t('app.autostart') }}
        </label>
      </div>
      <div class="actions">
        <button
          class="primary"
          @click="openChat"
        >
          {{ t('app.openChat') }}
        </button>
        <a
          class="muted"
          href="#"
          @click.prevent
        >{{ t('app.donate') }}</a>
      </div>
    </section>

    <section
      v-if="lastEvent"
      class="card"
    >
      <h2>{{ t('app.events') }}</h2>
      <p class="evline">
        <code class="evtype">{{ lastEvent.type }}</code>
        <code>{{ lastEvent.sessionId }}</code>
      </p>
      <p class="evtext">
        {{ snippet(lastEvent) }}
      </p>
    </section>
  </div>
</template>

<style>
:root {
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: #1f2328;
}
* { box-sizing: border-box; }
body { margin: 0; background: #f6f8fa; }
.shell { max-width: 620px; margin: 6vh auto 0; padding: 0 24px 40px; }
.brand h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
.tagline { margin: 4px 0 28px; color: #57606a; }
.card {
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  padding: 20px 24px;
  margin-bottom: 16px;
}
.card h2 { margin: 0 0 12px; font-size: 16px; }
.meta { list-style: none; margin: 0; padding: 0; }
.meta li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eff2f5; }
.meta li span { color: #57606a; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #57606a; }
label.check { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; padding-top: 20px; }
input, select { font-size: 13px; padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
.actions { display: flex; gap: 10px; align-items: center; margin-top: 14px; }
button { font-size: 13px; padding: 6px 16px; border-radius: 6px; border: 1px solid #d0d7de; background: #f6f8fa; cursor: pointer; }
button.primary { background: #1f883d; border-color: #1f883d; color: #fff; }
button:disabled { opacity: 0.6; }
button.mini { padding: 2px 8px; font-size: 11px; margin-left: auto; }
.muted { color: #57606a; font-size: 12px; }
.warn { color: #bf8700; font-size: 12px; }
.result { margin-top: 12px; padding: 10px 12px; border-radius: 6px; font-size: 13px; }
.result.ok { background: #dafbe1; color: #1a7f37; }
.result.bad { background: #ffebe9; color: #cf222e; }
.saved h3 { font-size: 13px; margin: 16px 0 6px; }
.saved ul { list-style: none; margin: 0; padding: 0; }
.row { display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 4px 0; }
.pname { font-weight: 600; }
.evline { display: flex; gap: 8px; margin: 0 0 8px; flex-wrap: wrap; }
.evtype { background: #ddf4ff; color: #0969da; padding: 1px 8px; border-radius: 8px; font-size: 12px; }
.evtext { margin: 0; font-size: 12px; color: #57606a; word-break: break-all; }
</style>
