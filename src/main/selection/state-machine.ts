import type { PipelineEvent } from '../../shared'

export type SelectionState =
  | 'IDLE'
  | 'VALIDATE_SELECTION'
  | 'NO_ACTION'
  | 'POSITION_TOOLBAR'
  | 'TOOLBAR_VISIBLE'

const DEDUP_WINDOW_MS = 300
const MAX_TEXT_LENGTH = 20000

/**
 * Main-side slice of the SPEC A1 state machine: VALIDATE_SELECTION →
 * POSITION_TOOLBAR → TOOLBAR_VISIBLE. Helper-side states (hook, identify,
 * sensitive, capture) arrive as events and are logged for observability (A4-9).
 */
export class SelectionMachine {
  state: SelectionState = 'IDLE'
  activeSessionId: string | null = null

  private lastText = ''
  private lastValidatedAt = 0

  constructor(private readonly log: (msg: string) => void) {}

  validate(env: PipelineEvent): boolean {
    const payload = env.payload as { text?: unknown }
    const text = typeof payload.text === 'string' ? payload.text : ''
    const now = Date.now()

    this.transition('VALIDATE_SELECTION', env.sessionId)
    if (!text.trim()) {
      this.transition('NO_ACTION', env.sessionId, 'empty')
      return false
    }
    if (text.length > MAX_TEXT_LENGTH) {
      this.transition('NO_ACTION', env.sessionId, `too long (${text.length})`)
      return false
    }
    if (text === this.lastText && now - this.lastValidatedAt < DEDUP_WINDOW_MS) {
      this.transition('NO_ACTION', env.sessionId, 'duplicate event')
      return false
    }
    this.lastText = text
    this.lastValidatedAt = now
    this.activeSessionId = env.sessionId
    return true
  }

  transition(next: SelectionState, sessionId: string | null, detail = ''): void {
    this.log(`[sm] ${this.state} -> ${next} sid=${sessionId ?? '-'}${detail ? ' ' + detail : ''}`)
    this.state = next
    if (next === 'IDLE' || next === 'NO_ACTION') this.activeSessionId = null
  }
}
