import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { app } from 'electron'
import type { LifecycleInfo, PipelineEvent } from '../../shared'

const HEARTBEAT_TIMEOUT_MS = 15000
const MAX_RESTART_ATTEMPTS = 5

/**
 * Owns the native helper process lifecycle (SPEC A3): spawn, heartbeat
 * watchdog, crash restart with backoff, DEGRADED after repeated failures.
 * Valid pipeline events are re-emitted for the selection machine.
 */
export class HelperClient extends EventEmitter {
  private proc: ChildProcess | null = null
  private lastBeat = 0
  private restartAttempts = 0
  private degraded = false
  private stopped = false
  private watchdog: NodeJS.Timeout | null = null
  private blacklist: string[] = []
  /** Soft respawn when config changes — must not count toward DEGRADED. */
  private respawningForConfig = false

  constructor(blacklist: string[] = []) {
    super()
    this.blacklist = [...blacklist]
  }

  setBlacklist(list: string[]): void {
    this.blacklist = [...list]
    if (this.stopped) return
    if (!this.proc) {
      // Helper not running (startup race / after crash): spawn with new list.
      if (!this.degraded) this.spawnHelper()
      return
    }
    this.respawningForConfig = true
    try {
      this.proc.kill()
    } catch {
      this.respawningForConfig = false
      this.spawnHelper()
    }
  }

  get isDegraded(): boolean {
    return this.degraded
  }

  /** Clear DEGRADED and try spawning the helper again (user-initiated). */
  recoverFromDegraded(): void {
    this.degraded = false
    this.restartAttempts = 0
    this.stopped = false
    if (this.proc) {
      this.respawningForConfig = true
      try {
        this.proc.kill()
      } catch {
        this.respawningForConfig = false
        this.emitLifecycle({ state: 'restarting', attempt: 1 })
        this.spawnHelper()
      }
      return
    }
    this.emitLifecycle({ state: 'restarting', attempt: 1 })
    this.spawnHelper()
  }

  start(): void {
    this.stopped = false
    this.spawnHelper()
    this.watchdog = setInterval(() => this.checkHeartbeat(), 3000)
  }

  captureNow(): void {
    this.proc?.stdin?.write('captureNow\n')
  }

  shutdown(): void {
    this.stopped = true
    if (this.watchdog) clearInterval(this.watchdog)
    try {
      this.proc?.stdin?.write('shutdown\n')
    } catch {
      // helper already gone
    }
    const proc = this.proc
    setTimeout(() => {
      try {
        proc?.kill()
      } catch {
        // already exited
      }
    }, 1500)
  }

  private helperPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'helper', 'PromptlyHelper.exe')
      : join(app.getAppPath(), 'build', 'helper', 'PromptlyHelper.exe')
  }

  private spawnHelper(): void {
    if (this.stopped) return
    const args = [
      '--pid',
      String(process.pid),
      '--threshold',
      '6',
      '--poll',
      '15',
      '--timeout',
      '600',
      '--blacklist',
      this.blacklist.join(',')
    ]
    this.proc = spawn(this.helperPath(), args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.lastBeat = Date.now()

    const stdout = this.proc.stdout
    if (stdout) {
      const rl = createInterface({ input: stdout })
      rl.on('line', (line) => this.handleLine(line))
    }

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      if (!app.isPackaged) process.stderr.write(chunk)
    })

    this.proc.on('exit', () => {
      this.proc = null
      if (this.stopped) return
      if (this.respawningForConfig) {
        this.respawningForConfig = false
        this.spawnHelper()
        return
      }
      this.emitLifecycle({ state: 'crashed', attempt: this.restartAttempts + 1 })
      this.scheduleRestart()
    })
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let env: PipelineEvent
    try {
      env = JSON.parse(trimmed) as PipelineEvent
    } catch {
      return
    }
    if (env.version !== 1 || typeof env.type !== 'string') return

    this.lastBeat = Date.now()
    if (env.type === 'hello' || env.type === 'heartbeat') {
      if (this.restartAttempts > 0) {
        this.restartAttempts = 0
        this.emitLifecycle({ state: 'ready' })
      } else if (!this.degraded && env.type === 'hello') {
        this.emitLifecycle({ state: 'ready' })
      }
      return
    }
    this.emit('event', env)
  }

  private checkHeartbeat(): void {
    if (this.stopped || this.proc === null) return
    if (Date.now() - this.lastBeat > HEARTBEAT_TIMEOUT_MS) {
      this.proc.kill()
    }
  }

  private scheduleRestart(): void {
    this.restartAttempts += 1
    if (this.restartAttempts > MAX_RESTART_ATTEMPTS) {
      this.degraded = true
      this.emitLifecycle({ state: 'degraded' })
      return
    }
    const delay = Math.min(1000 * 2 ** (this.restartAttempts - 1), 10000)
    this.emitLifecycle({ state: 'restarting', attempt: this.restartAttempts })
    setTimeout(() => this.spawnHelper(), delay)
  }

  private emitLifecycle(info: LifecycleInfo): void {
    this.emit('lifecycle', info)
  }
}
