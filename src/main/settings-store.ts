import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

export type SelectionMode = 'auto' | 'hotkey'

export interface AppSettings {
  language: string
  autostart: boolean
  initialized: boolean
  /** SPEC Q5: auto = select-to-show toolbar; hotkey = only Ctrl+Shift+A */
  selectionMode: SelectionMode
  /** Process names without .exe (e.g. "League of Legends" / notepad). Helper CHECK_APPLICATION. */
  blacklist: string[]
  ballPosition?: { x: number; y: number }
  /** anonymous install counter (one ping per version, no content). */
  statsEnabled: boolean
  pingedVersion?: string
}

/** SPEC appendix D: first-run / install default is ON; Settings can turn it off. */
const DEFAULTS: AppSettings = {
  language: 'en',
  autostart: true,
  initialized: false,
  selectionMode: 'auto',
  blacklist: [],
  statsEnabled: true
}
let cache: AppSettings | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppSettings>
      const mode = raw.selectionMode === 'hotkey' ? 'hotkey' : 'auto'
      cache = {
        ...DEFAULTS,
        ...raw,
        selectionMode: mode,
        blacklist: normalizeBlacklist(raw.blacklist)
      }
      return cache
    }
  } catch (e) {
    console.error('[settings] load failed:', e)
  }
  cache = { ...DEFAULTS }
  return cache
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = { ...loadSettings(), ...patch }
  if (merged.selectionMode !== 'auto' && merged.selectionMode !== 'hotkey') {
    merged.selectionMode = 'auto'
  }
  if ('blacklist' in patch) {
    merged.blacklist = normalizeBlacklist(patch.blacklist)
  } else {
    merged.blacklist = normalizeBlacklist(merged.blacklist)
  }
  cache = merged
  writeFileSync(file(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

/**
 * SPEC: installer / first-run defaults autostart ON; Settings checkbox can turn it off.
 * Existing profiles (initialized already) keep their saved choice and only sync the OS login item.
 */
export function applyFirstRunAutostart(): void {
  const s = loadSettings()
  if (!s.initialized) {
    setAutostart(true)
    saveSettings({ initialized: true })
    return
  }
  app.setLoginItemSettings({ openAtLogin: s.autostart })
}

export function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled })
  // NSIS customInstall also writes HKCU Run "Promptly"; clear it when the user opts out
  // so Settings off really disables boot start (not only Electron's own login-item entry).
  if (process.platform === 'win32' && !enabled) {
    try {
      spawnSync(
        'reg',
        ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'Promptly', '/f'],
        { windowsHide: true }
      )
    } catch {
      // ignore: key may already be absent
    }
  }
  saveSettings({ autostart: enabled })
}

export function setSelectionMode(mode: SelectionMode): void {
  saveSettings({ selectionMode: mode === 'hotkey' ? 'hotkey' : 'auto' })
}

/** Normalize process names: trim, drop .exe, lowercase, dedupe. */
export function normalizeBlacklist(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    let s = raw.trim().toLowerCase()
    if (!s) continue
    if (s.endsWith('.exe')) s = s.slice(0, -4)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export function setBlacklist(list: unknown): string[] {
  const normalized = normalizeBlacklist(list)
  saveSettings({ blacklist: normalized })
  return normalized
}

export function setStatsEnabled(enabled: boolean): void {
  saveSettings({ statsEnabled: enabled })
}