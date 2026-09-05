<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from './stores/app'
import type { LifecycleInfo, PipelineEvent } from '@shared'
import type { ProviderProfile, ProviderView, TestConnectionResult } from '@shared'
import { SUPPORTED_LOCALES, LOCALE_LABELS, applyLocale, type Locale } from './i18n'
import { DONATE } from '@shared/config'

const app = useAppStore()
const { t, locale } = useI18n()

const lastEvent = ref<PipelineEvent | null>(null)
const eventCount = ref(0)
const lifecycle = ref<LifecycleInfo | null>(null)
const isDegraded = computed(() => lifecycle.value?.state === 'degraded')
const helperStatusLabel = computed(() => {
  const s = lifecycle.value?.state
  if (s === 'degraded') return t('app.helperDegraded')
  if (s === 'restarting' || s === 'crashed') return t('app.helperRestarting')
  if (s === 'ready') return t('app.helperReady')
  return t('app.helperUnknown')
})
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
const autostart = ref(false)
const selectionMode = ref<'auto' | 'hotkey'>('auto')
const blacklist = ref<string[]>([])
const blacklistInput = ref('')
const statsEnabled = ref(true)
type UpdateState = { phase: string; version?: string; percent?: number }
const updateState = ref<UpdateState>({ phase: 'idle' })
let offUpdate: (() => void) | null = null
const donateOpen = ref(false)
let offDonate: (() => void) | null = null

function openDonate(): void {
  donateOpen.value = true
}

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
  selectionMode.value = s.selectionMode === 'hotkey' ? 'hotkey' : 'auto'
  blacklist.value = Array.isArray(s.blacklist) ? [...s.blacklist] : []
  statsEnabled.value = s.statsEnabled
}

async function onStatsChange(): Promise<void> {
  await window.promptly.setStats(statsEnabled.value)
}

async function onLanguageChange(): Promise<void> {
  locale.value = settingsLanguage.value as Locale
  await window.promptly.setLanguage(settingsLanguage.value)
}

async function onAutostartChange(): Promise<void> {
  await window.promptly.setAutostart(autostart.value)
}

async function onSelectionModeChange(): Promise<void> {
  await window.promptly.setSelectionMode(selectionMode.value)
}

async function persistBlacklist(): Promise<void> {
  const r = await window.promptly.setBlacklist(blacklist.value)
  if (r?.blacklist) blacklist.value = [...r.blacklist]
}

async function addBlacklistEntry(): Promise<void> {
  const raw = blacklistInput.value.trim()
  if (!raw) return
  const parts = raw.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean)
  blacklist.value = [...blacklist.value, ...parts]
  blacklistInput.value = ''
  await persistBlacklist()
}

async function removeBlacklistEntry(name: string): Promise<void> {
  blacklist.value = blacklist.value.filter((x) => x !== name)
  await persistBlacklist()
}

async function openPrivacy(): Promise<void> {
  await window.promptly.openPrivacy()
}

async function recoverHelper(): Promise<void> {
  await window.promptly.recoverHelper()
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
  if (r.ok) {
    saveMsg.value = t('app.savedHiding')
    setTimeout(() => window.promptly.hideMainWindow(), 1500)
  } else {
    saveMsg.value = t('app.saveFailed')
  }
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

async function resetBall(): Promise<void> {
  await window.promptly.resetBall()
}

function openChat(): void {
  window.promptly.openChat()
}

function openFeedback(): void {
  void window.promptly.openFeedback()
}

function updateLine(): string {
  const s = updateState.value
  if (s.phase === 'checking') return t('update.checking')
  if (s.phase === 'up-to-date') return t('update.upToDate')
  if (s.phase === 'downloading') return t('update.downloading', { version: s.version ?? '', percent: s.percent ?? 0 })
  if (s.phase === 'ready') return t('update.ready', { version: s.version ?? '' })
  return ''
}

function updateCheck(): void {
  void window.promptly.updateCheck()
}
function updateInstall(): void {
  window.promptly.updateInstall()
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
  offUpdate = window.promptly.onUpdateState((s) => {
    updateState.value = s
  })
  offDonate = window.promptly.onDonateOpen(() => openDonate())
})

onUnmounted(() => {
  offEvent?.()
  offLifecycle?.()
  offLocale?.()
  offUpdate?.()
  offDonate?.()
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
      <h1><span class="spark">✦</span> Promptly</h1>
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
            <code>{{ helperStatusLabel }}</code>
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

    <section
      v-if="isDegraded"
      class="card degraded-banner"
      role="alert"
    >
      <h2>{{ t('app.helperDegradedTitle') }}</h2>
      <p>{{ t('app.helperDegradedBody') }}</p>
      <button
        type="button"
        class="ghost"
        @click="recoverHelper"
      >{{ t('app.helperRetry') }}</button>
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
            >{{ LOCALE_LABELS[l] }}</option>
          </select>
        </label>
        <label>
          {{ t('app.selectionMode') }}
          <select
            v-model="selectionMode"
            @change="onSelectionModeChange"
          >
            <option value="auto">{{ t('app.selectionModeAuto') }}</option>
            <option value="hotkey">{{ t('app.selectionModeHotkey') }}</option>
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
        <label class="check">
          <input
            v-model="statsEnabled"
            type="checkbox"
            @change="onStatsChange"
          >
          {{ t('app.stats') }}
        </label>
      </div>
      <div class="blacklist">
        <div class="blacklist-title">{{ t('app.blacklist') }}</div>
        <p class="hint">{{ t('app.blacklistHint') }}</p>
        <div class="blacklist-add">
          <input
            v-model="blacklistInput"
            type="text"
            :placeholder="t('app.blacklistPlaceholder')"
            @keydown.enter.prevent="addBlacklistEntry"
          >
          <button
            type="button"
            class="ghost"
            @click="addBlacklistEntry"
          >{{ t('app.blacklistAdd') }}</button>
        </div>
        <ul
          v-if="blacklist.length"
          class="blacklist-list"
        >
          <li
            v-for="name in blacklist"
            :key="name"
          >
            <code>{{ name }}</code>
            <button
              type="button"
              class="ghost danger"
              @click="removeBlacklistEntry(name)"
            >{{ t('app.blacklistRemove') }}</button>
          </li>
        </ul>
        <p
          v-else
          class="hint"
        >{{ t('app.blacklistEmpty') }}</p>
      </div>
      <div class="actions">
        <button
          class="primary"
          @click="openChat"
        >
          {{ t('app.openChat') }}
        </button>
        <button @click="resetBall">{{ t('app.resetBall') }}</button>
        <a
          class="muted"
          href="#"
          @click.prevent="openDonate"
        >♥ {{ t('update.donateTitle') }}</a>
        <a class="muted" href="#" @click.prevent="openFeedback">✉ {{ t('app.feedback') }}</a>
        <a
          class="muted"
          href="#"
          @click.prevent="openPrivacy"
        >{{ t('app.privacy') }}</a>
      </div>
      <p
        v-if="updateLine()"
        class="updateline"
      >
        {{ updateLine() }}
        <button
          v-if="updateState.phase === 'ready'"
          class="mini"
          @click="updateInstall"
        >{{ t('update.install') }}</button>
        <button
          v-else-if="updateState.phase === 'idle' || updateState.phase === 'up-to-date'"
          class="mini"
          @click="updateCheck"
        >{{ t('update.check') }}</button>
      </p>
    </section>

    <div
      v-if="donateOpen"
      class="overlay"
      @click.self="donateOpen = false"
    >
      <div class="donate card">
        <h2>♥ {{ t('update.donateTitle') }}</h2>
        <p class="muted">{{ t('update.thanks') }}</p>
        <div class="qrrow">
          <figure>
            <img
              src="./assets/donate-wechat.png"
              alt="WeChat"
            >
            <figcaption>{{ t('update.wechat') }}</figcaption>
          </figure>
          <figure>
            <img
              src="./assets/donate-alipay.png"
              alt="Alipay"
            >
            <figcaption>{{ t('update.alipay') }}</figcaption>
          </figure>
        </div>
        <div class="links">
          <a
            class="donbtn"
            :href="DONATE.afdian"
            target="_blank"
          >{{ t('update.afdian') }}</a>
          <a
            class="donbtn"
            :href="DONATE.sponsors"
            target="_blank"
          >{{ t('update.sponsors') }}</a>
          <a
            class="donbtn"
            :href="DONATE.kofi"
            target="_blank"
          >{{ t('update.kofi') }}</a>
        </div>
        <button
          class="mini"
          @click="donateOpen = false"
        >✕</button>
      </div>
    </div>

    <details
      v-if="lastEvent"
      class="evcard"
    >
      <summary>{{ t('app.events') }} · {{ eventCount }}</summary>
      <p class="evline">
        <code class="evtype">{{ lastEvent.type }}</code>
        <code>{{ lastEvent.sessionId }}</code>
      </p>
      <p class="evtext">
        {{ snippet(lastEvent) }}
      </p>
    </details>
  </div>
</template>

<style>
:root {
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: var(--text);
}
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 5px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: var(--text-3); background-clip: content-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
.shell { max-width: 620px; margin: 6vh auto 0; padding: 0 24px 40px; }
.brand h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
.brand h1 .spark { color: var(--accent); font-size: 20px; }
.tagline { margin: 4px 0 28px; color: var(--text-2); }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 16px;
}
.card h2 { margin: 0 0 12px; font-size: 16px; }
.meta { list-style: none; margin: 0; padding: 0; }
.meta li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); }
.meta li span { color: var(--text-2); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-2); }
label.check { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; padding-top: 20px; }
input, select { font-size: 13px; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-btn); background: var(--surface); color: var(--text); }
.actions { display: flex; gap: 10px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
button { font-size: 13px; padding: 6px 16px; border-radius: var(--radius-btn); border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; }
button:hover { border-color: var(--text-3); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
button:disabled { opacity: 0.6; }
button.mini { padding: 2px 8px; font-size: 11px; margin-left: auto; }
.muted { color: var(--text-2); font-size: 12px; }
.warn { color: #bf8700; font-size: 12px; }
.result { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-btn); font-size: 13px; }
.result.ok { background: rgba(34, 197, 94, 0.12); color: #15803d; }
.result.bad { background: rgba(239, 68, 68, 0.1); color: #b91c1c; }
.saved h3 { font-size: 13px; margin: 16px 0 6px; }
.saved ul { list-style: none; margin: 0; padding: 0; }
.row { display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 4px 0; }
.pname { font-weight: 600; }
details.evcard summary { cursor: pointer; color: var(--text-2); font-size: 13px; }
.evline { display: flex; gap: 8px; margin: 8px 0; flex-wrap: wrap; }
.evtype { background: var(--accent-soft); color: var(--accent); padding: 1px 8px; border-radius: 8px; font-size: 12px; }
.evtext { margin: 0; font-size: 12px; color: var(--text-2); word-break: break-all; }
.updateline { margin: 10px 0 0; font-size: 12px; color: var(--text-2); display: flex; align-items: center; gap: 8px; }
.overlay { position: fixed; inset: 0; background: rgba(15, 17, 21, 0.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.donate { max-width: 460px; width: 90%; text-align: center; }
.donate h2 { margin: 0 0 6px; }
.qrrow { display: flex; gap: 16px; justify-content: center; margin: 14px 0; }
.qrrow figure { margin: 0; }
.qrrow img { width: 160px; height: 160px; border: 1px solid var(--border); border-radius: var(--radius); }
.qrrow figcaption { font-size: 12px; color: var(--text-2); margin-top: 4px; }
.links { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 10px 0 14px; }
.donbtn { font-size: 13px; padding: 6px 14px; border-radius: var(--radius-btn); background: var(--accent); color: #fff; text-decoration: none; }
.donbtn:hover { background: var(--accent-hover); }

.degraded-banner {
  border-color: #b45309;
  background: #fff7ed;
}
.degraded-banner h2 { margin: 0 0 6px; color: #9a3412; font-size: 16px; }
.degraded-banner p { margin: 0 0 10px; color: #9a3412; font-size: 13px; }
</style>
