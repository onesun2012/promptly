<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from './stores/app'

const app = useAppStore()

onMounted(() => {
  app.load()
})
</script>

<template>
  <div class="shell">
    <header class="brand">
      <h1>Promptly</h1>
      <p class="tagline">
        Select text anywhere. Ask with your own AI.
      </p>
    </header>

    <main class="card">
      <template v-if="app.loaded && app.info">
        <h2>M0 scaffold ready</h2>
        <ul class="meta">
          <li><span>App</span><code>{{ app.info.name }} v{{ app.info.version }}</code></li>
          <li><span>Electron</span><code>{{ app.info.electron }}</code></li>
          <li><span>Node</span><code>{{ app.info.node }}</code></li>
          <li><span>Platform</span><code>{{ app.info.platform }}</code></li>
        </ul>
        <p class="hint">
          Renderer ⇄ preload ⇄ main IPC verified.
        </p>
      </template>
      <p v-else>
        Loading…
      </p>
    </main>
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
  margin: 12vh auto 0;
  padding: 0 24px;
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
</style>
