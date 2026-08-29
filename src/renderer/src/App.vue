<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from './stores/app'
import type { LifecycleInfo, PipelineEvent } from '@shared'
import type { ProviderProfile, ProviderView, TestConnectionResult } from '@shared'

const app = useAppStore()

const lastEvent = ref<PipelineEvent | null>(null)
const eventCount = ref(0)
const lifecycle = ref<LifecycleInfo | null>(null)
let offEvent: (() => void) | null = null
let offLifecycle: (() => void) | null = null

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

async function refreshProfiles(): Promise<void> {
  profiles.value = await window.promptly.listProviders()
  const active = await window.promptly.activeProvider()
  activeId.value = active?.id ?? null
  if (active) {
    form.value = { ...active, apiKey: '' }
  }
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
  saveMsg.value = r.ok ? 'Saved (key encrypted via DPAPI).' : 'Save failed.'
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

onMounted(() => {
  void app.load()
  void refreshProfiles()
  offEvent = window.promptly.onPipelineEvent((env) => {
    lastEvent.value = env
    eventCount.value += 1
  })
  offLifecycle = window.promptly.onPipelineLifecycle((info) => {
    lifecycle.value = info
  })
})

onUnmounted(() => {
  offEvent?.()
  offLifecycle?.()
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
        Select anything. Ask any AI.
      </p>
    </header>

    <main class="card">
      <template v-if="app.loaded && app.info">
        <h2>M2 providers</h2>
        <ul class="meta">
          <li>
            <span>App</span>
            <code>{{ app.info.name }} v{{ app.info.version }}</code>
          </li>
          <li>
            <span>Helper</span>
            <code>{{ lifecycle ? lifecycle.state : 'starting…' }}</code>
          </li>
          <li>
            <span>Events</span>
            <code>{{ eventCount }}</code>
          </li>
        </ul>
      </template>
      <p v-else>
        Loading…
      </p>
    </main>

    <section class="card">
      <h2>Provider lab</h2>
      <div class="grid">
        <label>
          Protocol
          <select v-model="form.protocol">
            <option value="openai">OpenAI compatible</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label>
          Base URL
          <input
            v-model="form.baseUrl"
            spellcheck="false"
          >
        </label>
        <label>
          API key
          <input
            v-model="form.apiKey"
            type="password"
            spellcheck="false"
            placeholder="sk-…"
          >
        </label>
        <label>
          Model (optional)
          <input
            v-model="form.model"
            spellcheck="false"
            placeholder="auto from list"
          >
        </label>
      </div>
      <div class="actions">
        <button
          class="primary"
          :disabled="testing"
          @click="testProvider"
        >
          {{ testing ? 'Testing…' : 'Test connection' }}
        </button>
        <button @click="saveProvider">
          Save
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
          ✓ Connected in {{ testResult.latencyMs }}ms — {{ testResult.models?.length ?? 0 }} models.
          <div class="muted">
            Sample: {{ testResult.sampleReply }}
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
        <h3>Saved profiles</h3>
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
                title="OS encryption unavailable"
              >⚠ plain key</span>
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
      v-if="lastEvent"
      class="card"
    >
      <h2>Last pipeline event</h2>
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

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f6f8fa;
}

.shell {
  max-width: 620px;
  margin: 6vh auto 0;
  padding: 0 24px 40px;
}

.brand h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.02em;
}

.tagline {
  margin: 4px 0 28px;
  color: #57606a;
}

.card {
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  padding: 20px 24px;
  margin-bottom: 16px;
}

.card h2 {
  margin: 0 0 12px;
  font-size: 16px;
}

.meta {
  list-style: none;
  margin: 0;
  padding: 0;
}

.meta li {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #eff2f5;
}

.meta li span {
  color: #57606a;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #57606a;
}

input,
select {
  font-size: 13px;
  padding: 6px 8px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 14px;
}

button {
  font-size: 13px;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid #d0d7de;
  background: #f6f8fa;
  cursor: pointer;
}

button.primary {
  background: #1f883d;
  border-color: #1f883d;
  color: #fff;
}

button:disabled {
  opacity: 0.6;
}

button.mini {
  padding: 2px 8px;
  font-size: 11px;
  margin-left: auto;
}

.muted {
  color: #57606a;
  font-size: 12px;
}

.warn {
  color: #bf8700;
  font-size: 12px;
}

.result {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.result.ok {
  background: #dafbe1;
  color: #1a7f37;
}

.result.bad {
  background: #ffebe9;
  color: #cf222e;
}

.saved h3 {
  font-size: 13px;
  margin: 16px 0 6px;
}

.saved ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.pname {
  font-weight: 600;
}

.evline {
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
  flex-wrap: wrap;
}

.evtype {
  background: #ddf4ff;
  color: #0969da;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 12px;
}

.evtext {
  margin: 0;
  font-size: 12px;
  color: #57606a;
  word-break: break-all;
}
</style>
