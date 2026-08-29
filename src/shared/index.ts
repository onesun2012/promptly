export * from './providers'

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  platform: string
}

export type SensitiveDecision = 'safe' | 'sensitive' | 'unknown'

export interface SelectionCapturedPayload {
  text: string
  app: string
  windowTitle: string
  sensitive: SensitiveDecision
  method: 'uia' | 'clipboard'
  displacementPx: number
  cursor: { x: number; y: number }
}

export interface CaptureFailedPayload {
  reason: string
  app: string
}

export interface StatePayload {
  state: string
  detail: string
}

export interface PipelineEvent {
  version: number
  requestId: string
  sessionId: string
  type: 'hello' | 'heartbeat' | 'state' | 'selectionCaptured' | 'captureFailed'
  timestamp: number
  payload: Record<string, unknown>
}

export interface LifecycleInfo {
  state: 'ready' | 'restarting' | 'crashed' | 'degraded'
  attempt?: number
}
