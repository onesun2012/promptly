import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import * as secureStore from './secure-store'

/** Parse a simple KEY=VALUE .env (no export, no multiline). Never logs values. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i <= 0) continue
    const key = trimmed.slice(0, i).trim()
    let val = trimmed.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

/**
 * Dev-only: if no providers saved yet and project .env has APIKEY+BASEURL,
 * seed a BigModel (OpenAI-compatible) profile so local testing can start immediately.
 * Never runs when packaged. Does not overwrite existing profiles.
 */
export function seedProviderFromEnv(): void {
  if (app.isPackaged) return
  if (secureStore.listViews().length > 0) return

  const candidates = [
    join(process.cwd(), '.env'),
    join(app.getAppPath(), '.env'),
    join(app.getAppPath(), '..', '.env')
  ]
  let env: Record<string, string> = {}
  for (const p of candidates) {
    env = parseEnvFile(p)
    if (env.APIKEY && env.BASEURL) break
  }
  const apiKey = (env.APIKEY || env.API_KEY || '').trim()
  const baseUrl = (env.BASEURL || env.BASE_URL || '').trim()
  if (!apiKey || !baseUrl) return

  const model = (env.MODEL || env.API_MODEL || 'glm-4-flash').trim()
  secureStore.upsert({
    id: 'p_env_bigmodel',
    name: 'BigModel (.env)',
    protocol: 'openai',
    baseUrl,
    apiKey,
    model
  })
  secureStore.setActive('p_env_bigmodel')
  console.log('[dev] seeded provider from .env (BigModel)')
}