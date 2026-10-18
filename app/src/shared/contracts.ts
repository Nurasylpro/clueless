// Types and IPC channels shared by the main process, the preload script and the UI.
// Type-only imports from ./schema, so the UI bundle doesn't pull in zod.
import type { z } from 'zod'
import type * as S from './schema'

export type Subject = z.infer<typeof S.Subject>
export type GapType = z.infer<typeof S.GapType>
export type TurnKind = z.infer<typeof S.TurnKind>
export type Verdict = z.infer<typeof S.Verdict>
export type Expects = z.infer<typeof S.Expects>
export type PlanStep = z.infer<typeof S.PlanStep>
/** A visual frame. Conventions: "" = no label, -1 = none (see schema.ts). */
export type Scene = z.infer<typeof S.Scene>
export type Visual = z.infer<typeof S.Visual>

// App-side shapes: the wire format's "", -1 and "none" placeholders become null here.

export interface Gap {
  type: GapType
  topic: string
}

export interface AnswerCheck {
  kind: z.infer<typeof S.CheckKind>
  reference: string // math.js syntax; for 'antiderivative' the integrand
  variable: string | null
  unit: string | null
}

export interface TutorTurn {
  kind: TurnKind
  message: string // Markdown, math in $...$
  hintLevel: number // 0 = none, 1..5 = hint ladder
  verdict: Verdict
  plan: PlanStep[]
  gap: Gap | null
  expects: Expects
  choices: string[]
  visual: Visual | null
  check: AnswerCheck | null
}

export interface ProblemInfo {
  subject: Subject
  title: string
  summary: string
  language: string | null
  hiddenSolution: string // NEVER sent to the UI
}

export interface Recap {
  explainBack: string
  gaps: Gap[]
  flashcards: { front: string; back: string }[]
  similarProblem: string | null
}

export interface TutorReplyT {
  problem: ProblemInfo | null
  turn: TutorTurn
  recap: Recap | null
}

// ---------- what the UI sees (no hidden solution, no check reference) ----------

export type ProblemView = Omit<ProblemInfo, 'hiddenSolution'>

/** A tutor turn as shown in the UI: the answer-check reference is stripped out. */
export type TurnView = Omit<TutorTurn, 'check'> & { checkKind: AnswerCheck['kind'] | null }

export interface CheckResult {
  status: 'match' | 'mismatch' | 'missing_units' | 'wrong_units' | 'unparseable'
  detail: string
}

export type InputKind = 'text' | 'math' | 'code' | 'recall'

export type ThreadItem =
  | { id: string; role: 'tutor'; turn: TurnView; at: number }
  | { id: string; role: 'student'; text: string; as: InputKind; check: CheckResult | null; at: number }
  | { id: string; role: 'system'; text: string; at: number }

export interface StuckState {
  level: 0 | 1 | 2 // 0 fine, 1 glow, 2 "Stuck?" bubble
  reason: string | null
}

export interface RecapView extends Recap {
  hintsUsed: number
  attempts: number
  solved: boolean
  revealed: boolean
  cardsAdded: number
  afterItemId: string // show the recap card right after this thread item
}

export interface SessionView {
  id: string
  startedAt: number
  problem: ProblemView | null
  plan: PlanStep[]
  thread: ThreadItem[]
  expects: Expects
  choices: string[]
  attempts: number
  wrongStreak: number
  hintsUsed: number
  revealAllowed: boolean
  revealed: boolean
  solved: boolean
  busy: string | null // e.g. "Reading your screen…"
  error: string | null
  stuck: StuckState
  recap: RecapView | null
}

export type UserAction =
  | 'hint'
  | 'next'
  | 'check_my_work'
  | 'reveal'
  | 'im_fine'
  | 'finish'
  | 'new'
  | 'retry'

/** The student clicked a plan step: stuck on the current one, back to a done one, or "I've done this" on a locked one. */
export type StepIntent = 'stuck' | 'revisit' | 'claim'

export type WindowMode = 'compact' | 'expanded'

export interface AppStatus {
  platform: string
  provider: 'anthropic' | 'bedrock' | null // null = no Claude credentials configured yet
  model: string | null
  region: string | null // Bedrock only
  hasDeepgramKey: boolean
  screenAccess: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  hotkeys: { ask: string; area: string }
  hotkeyErrors: string[]
  envFile: string // where to put API keys / AWS settings
}

// ---------- memory ----------

export interface GapRecord {
  id: string
  subject: Subject
  type: GapType
  topic: string
  timesSeen: number
  firstSeen: string
  lastSeen: string
}

export interface CardView {
  id: string
  subject: Subject
  topic: string
  front: string
  back: string
  due: string
}

export interface MemoryView {
  gaps: GapRecord[]
  dueCards: CardView[]
  totalCards: number
  sessions: number
}

export type CardRating = 1 | 2 | 3 | 4 // again, hard, good, easy

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// ---------- IPC ----------

export const IPC = {
  // main -> UI
  session: 'session:update', // SessionView | null
  status: 'app:status-update', // AppStatus
  // UI -> main (send)
  ask: 'user:ask', // 'screen' | 'area'
  askText: 'user:ask-text', // the problem typed or pasted as text
  send: 'user:send', // { text, as }
  action: 'user:action', // UserAction
  step: 'user:step', // { id, intent }: a plan step was clicked
  setSubject: 'user:subject', // Subject
  windowMode: 'window:mode', // WindowMode
  fitHeight: 'window:fit-height', // number: the panel's height in px; the window follows it
  resizeWidth: 'window:resize-width', // { width, anchor }: the student dragged a side edge
  hide: 'window:hide',
  quit: 'app:quit',
  openScreenSettings: 'app:open-screen-settings',
  areaDone: 'area:done', // Rect
  areaCancel: 'area:cancel',
  // UI -> main (invoke)
  getStatus: 'app:get-status',
  getSession: 'session:get',
  getMemory: 'memory:get',
  rateCard: 'memory:rate', // { id, rating } -> MemoryView
  // Voice: one recording ("utterance") at a time, identified by an id the UI makes up
  voiceToggle: 'voice:toggle', // main -> UI: the voice hotkey was pressed
  voiceStart: 'voice:start', // UI -> main: utterance id
  voiceAudio: 'voice:audio', // UI -> main: { id, chunk } (MediaRecorder webm/opus bytes)
  voiceStop: 'voice:stop', // UI -> main: utterance id; finish and send the final transcript
  voiceCancel: 'voice:cancel', // UI -> main: utterance id; drop it, no transcript
  voiceTranscript: 'voice:transcript', // main -> UI: VoiceTranscript
  voiceState: 'voice:state', // main -> UI: VoiceStateEvent
  voiceMicAccess: 'voice:mic-access', // UI -> main (invoke): ask the OS for the microphone -> boolean
  voiceTts: 'voice:tts' // UI -> main (invoke): TtsRequest -> TtsResult (ElevenLabs audio)
} as const

// ---------- voice ----------

/** Live transcript of one utterance. `final` arrives at most once, when the student has paused. */
export interface VoiceTranscript {
  id: string
  text: string // everything heard so far
  interim: string // the end of `text` that may still change ("" once final)
  final: boolean
}

/** Deepgram connection state for one utterance. 'closed' always comes last. */
export type VoiceStateEvent =
  | { id: string; state: 'listening' }
  | { id: string; state: 'closed'; reason: 'done' | 'no-speech' | 'cancelled' }
  | { id: string; state: 'error'; message: string }

/** One piece of a reply to read aloud; the neighbouring text keeps the intonation natural. */
export interface TtsRequest {
  text: string
  previousText?: string
  nextText?: string
}

export type TtsResult =
  | { ok: true; audio: ArrayBuffer; mime: string }
  | { ok: false; reason: 'no-key' | 'error'; message: string }

/** The API the preload script exposes to the UI as `window.clueless`. */
export interface CluelessApi {
  getStatus(): Promise<AppStatus>
  getSession(): Promise<SessionView | null>
  onSession(cb: (view: SessionView | null) => void): () => void
  onStatus(cb: (status: AppStatus) => void): () => void
  ask(mode: 'screen' | 'area'): void
  askText(text: string): void
  send(input: { text: string; as: InputKind }): void
  action(action: UserAction): void
  step(id: number, intent: StepIntent): void
  setSubject(subject: Subject): void
  setWindowMode(mode: WindowMode): void
  fitHeight(px: number): void
  /** Set the window width; `anchor` is the edge that stays put. */
  resizeWidth(width: number, anchor: 'left' | 'right'): void
  hide(): void
  quit(): void
  openScreenSettings(): void
  getMemory(): Promise<MemoryView>
  rateCard(id: string, rating: CardRating): Promise<MemoryView>
  areaDone(rect: Rect): void
  areaCancel(): void
  // voice
  micAccess(): Promise<boolean>
  voiceStart(id: string): void
  voiceAudio(id: string, chunk: ArrayBuffer): void
  voiceStop(id: string): void
  voiceCancel(id: string): void
  onVoiceTranscript(cb: (t: VoiceTranscript) => void): () => void
  onVoiceState(cb: (e: VoiceStateEvent) => void): () => void
  onVoiceToggle(cb: () => void): () => void
  tts(req: TtsRequest): Promise<TtsResult>
}
