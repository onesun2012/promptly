import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProviderProfile, ProviderProtocol, ProviderView } from './providers/types'

interface StoredProfile {
  id: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  model?: string
  apiKeyEnc?: string // base64(safeStorage.encryptString)
  apiKeyPlain?: string // fallback when OS-level encryption is unavailable
}

interface StoreFile {
  version: 1
  activeId: string | null
  profiles: StoredProfile[]
}

const EMPTY: StoreFile = { version: 1, activeId: null, profiles: [] }

let cache: StoreFile | null = null

function file(): string {
  return join(app.getPath('userData'), 'providers.json')
}

function load(): StoreFile {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      cache = JSON.parse(readFileSync(file(), 'utf8')) as StoreFile
      return cache
    }
  } catch (e) {
    console.error('[secure-store] load failed:', e)
  }
  cache = { ...EMPTY, profiles: [] }
  return cache
}

function save(): void {
  if (!cache) return
  writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8')
}

function decryptKey(stored: StoredProfile): string {
  if (stored.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.apiKeyEnc, 'base64'))
    } catch (e) {
      console.error('[secure-store] decrypt failed:', e)
    }
  }
  return stored.apiKeyPlain ?? ''
}

function encryptKey(apiKey: string): { apiKeyEnc?: string; apiKeyPlain?: string } {
  if (!apiKey) return {}
  if (safeStorage.isEncryptionAvailable()) {
    return { apiKeyEnc: safeStorage.encryptString(apiKey).toString('base64') }
  }
  console.warn('[secure-store] safeStorage unavailable - storing key WITHOUT encryption')
  return { apiKeyPlain: apiKey }
}

export function listViews(): ProviderView[] {
  return load().profiles.map((p) => ({
    id: p.id,
    name: p.name,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    model: p.model,
    hasKey: Boolean(p.apiKeyEnc || p.apiKeyPlain),
    insecureKey: !p.apiKeyEnc && Boolean(p.apiKeyPlain)
  }))
}

export function upsert(profile: ProviderProfile): void {
  const store = load()
  const existing = store.profiles.find((p) => p.id === profile.id)
  const keyPart = profile.apiKey ? encryptKey(profile.apiKey) : {}
  if (existing) {
    Object.assign(existing, {
      name: profile.name,
      protocol: profile.protocol,
      baseUrl: profile.baseUrl,
      model: profile.model,
      ...keyPart
    })
  } else {
    store.profiles.push({
      id: profile.id,
      name: profile.name,
      protocol: profile.protocol,
      baseUrl: profile.baseUrl,
      model: profile.model,
      ...keyPart
    })
    if (!store.activeId) store.activeId = profile.id
  }
  save()
}

export function remove(id: string): void {
  const store = load()
  store.profiles = store.profiles.filter((p) => p.id !== id)
  if (store.activeId === id) store.activeId = store.profiles[0]?.id ?? null
  save()
}

export function setActive(id: string): void {
  const store = load()
  if (store.profiles.some((p) => p.id === id)) {
    store.activeId = id
    save()
  }
}

export function getActive(): ProviderProfile | null {
  const store = load()
  const stored = store.profiles.find((p) => p.id === store.activeId)
  if (!stored) return null
  return {
    id: stored.id,
    name: stored.name,
    protocol: stored.protocol,
    baseUrl: stored.baseUrl,
    model: stored.model,
    apiKey: decryptKey(stored)
  }
}
