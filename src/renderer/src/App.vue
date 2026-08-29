<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from './stores/app'
import type { LifecycleInfo, PipelineEvent } from '@shared'

const app = useAppStore()

const lastEvent = ref<PipelineEvent | null>(null)
const eventCount = ref(0)
const lifecycle = ref<LifecycleInfo | null>(null)
let offEvent: (() => void) | null = null
let offLifecycle: (() => void) | null = null

onMounted(() => {
  void app.load()
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
        <h2>M1 selection pipeline</h2>
        <ul class="meta">
          <li>
            <span>App</span>
            <code>{{ app.info.name }} v{{ app.info.version }}</code>
          </li>
          <li>
            <span>Electron</span>
            <code>{{ app.info.electron }}</code>
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
        <p class="hint">
          Drag-select text in any app to see the pipeline live.
        </p>
      </template>
      <p v-else>
        Loading…
      </p>
    </main>

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
  max-width: 560px;
  margin: 8vh auto 0;
  padding: 0 24px 40px;
}

.brand h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.02em;
}

.tagline {
  margin: 4px 0 32px;
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

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: #1a7f37;
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
