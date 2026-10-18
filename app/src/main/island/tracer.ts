// "Ask" on highlighted text (or a typed / spoken question): one conversation with Claude.
// - Animate off, or not code: Claude explains it in text.
// - Animate on, Python: Claude picks an input and how to call the code, the app runs it for real
//   (src/main/run) to get every step, then Claude writes the words for the steps (one line each,
//   shown on top and read aloud). If the run can't start, Claude writes the trace itself.
// - Animate on, other languages: Claude writes the step-by-step trace, words included.
// No Electron imports, so scripts/try-trace.mts and the tests use it directly.
import Anthropic, { BetaFallbackState } from '@anthropic-ai/sdk'
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { z } from 'zod'
import type { AskInput, ScreenQuestion, TracerLike } from '../../shared/islandController'
import {
  fromTraceWire,
  NarrationWire,
  normalizeSnippet,
  numberLines,
  TraceWire,
  withNarration,
  type CodeTrace,
  type EntityValue,
  type NarrationWireT,
  type TraceReply,
  type TraceWireT
} from '../../shared/trace'
import { looksLikePython, toCodeTrace, type PythonRunner } from '../run/python'
import { errorMessage, TutorError, type ImageInput, type TutorTransport } from '../tutor/tutor'
import { NARRATE_PROMPT, TRACE_PROMPT } from './prompt'

/** Room for long traces; streaming keeps a long answer from hitting an HTTP timeout. */
const MAX_TOKENS = 64000

/** A trace that takes longer than this is given up on, so the island never waits forever.
 *  (Measured on bubble sort: medium and high ~16 s, max ~88 s.) */
export const TRACE_TIMEOUT_MS = 150_000

/** The words for a recorded run are a nice-to-have: past this, the app writes them itself. */
export const NARRATE_TIMEOUT_MS = 30_000

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = JSON.parse(JSON.stringify(z.toJSONSchema(schema)).replaceAll('"oneOf"', '"anyOf"'))
  delete json.$schema
  return json as Record<string, unknown>
}

export const traceSchema = jsonSchema(TraceWire)
export const narrationSchema = jsonSchema(NarrationWire)

const toolModeRules = (tool: string): string =>
  `\n\n# How to answer\nAlways answer by calling the \`${tool}\` tool exactly once, with every field filled. Write nothing outside the tool call.`

/** The streaming slice of an Anthropic or AnthropicBedrockMantle client. */
interface StreamingClient {
  beta: {
    messages: {
      stream(
        params: Record<string, unknown>,
        options?: { fallbackState?: BetaFallbackState; signal?: AbortSignal }
      ): { finalMessage(): Promise<BetaMessage> }
    }
  }
}

interface Turn {
  text: string
  images?: ImageInput[]
  toolError?: string
}

interface ReplySpec<T> {
  system: string
  schema: z.ZodType<T>
  json: Record<string, unknown>
  tool: string // the tool Claude answers through on Bedrock (no structured outputs there)
  timeoutMs: number
}

const TRACE_SPEC: ReplySpec<TraceWireT> = { system: TRACE_PROMPT, schema: TraceWire, json: traceSchema, tool: 'reply', timeoutMs: TRACE_TIMEOUT_MS }
const NARRATE_SPEC: ReplySpec<NarrationWireT> = { system: NARRATE_PROMPT, schema: NarrationWire, json: narrationSchema, tool: 'narrate', timeoutMs: NARRATE_TIMEOUT_MS }

/** One conversation with Claude whose every reply has the same shape. Append-only. */
class Conversation<T> {
  readonly messages: BetaMessageParam[] = []
  private readonly fallbackState = new BetaFallbackState()
  private pendingToolUseId: string | null = null
  private client: StreamingClient
  private useServerFallbacks: boolean

  constructor(
    private readonly transport: TutorTransport,
    private readonly spec: ReplySpec<T>,
    private readonly log: (line: string) => void
  ) {
    this.client = transport.client as unknown as StreamingClient
    this.useServerFallbacks = transport.serverFallbacks
  }

  async request(turn: Turn, effort: Effort, retries = 1): Promise<T> {
    this.messages.push(this.userMessage(turn))
    const started = Date.now()
    let response: BetaMessage
    try {
      response = await this.send(effort)
    } catch (err) {
      this.messages.pop() // keep the conversation alternating user/assistant
      if (err instanceof TutorError) throw err
      if (err instanceof Anthropic.APIUserAbortError) {
        throw new TutorError(`That took longer than ${Math.round(this.spec.timeoutMs / 1000)} s, so I stopped. Try highlighting less code.`, 'api')
      }
      throw new TutorError(errorMessage(err), 'api')
    }

    this.pendingToolUseId = null
    this.messages.push({ role: 'assistant', content: response.content as unknown as BetaContentBlockParam[] })
    const u = response.usage
    this.log(`${this.spec.tool}: ${effort} ${Date.now() - started}ms in=${u.input_tokens} cached=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens}`)

    if (response.stop_reason === 'refusal') throw new TutorError("Clueless can't help with this one.", 'refusal')
    if (response.stop_reason === 'max_tokens') throw new TutorError('The answer was too long and got cut off. Try a shorter highlight.', 'max_tokens')

    if (this.transport.mode === 'structured') {
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new TutorError('Clueless got a garbled reply. Try again.', 'bad_output')
      }
      const parsed = this.spec.schema.safeParse(json)
      if (!parsed.success) throw new TutorError('Clueless got an unexpected reply. Try again.', 'bad_output')
      return parsed.data
    }

    // Bedrock: the reply is the tool's input. One retry if it's missing or malformed.
    const call = response.content.find((b) => b.type === 'tool_use' && b.name === this.spec.tool)
    if (call && call.type === 'tool_use') {
      this.pendingToolUseId = call.id
      const parsed = this.spec.schema.safeParse(call.input)
      if (parsed.success) return parsed.data
      if (retries > 0) {
        const problems = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        this.log(`${this.spec.tool}: reply didn't match the schema (${problems}), asking again`)
        return this.request(
          { text: '', toolError: `That reply didn't match the schema (${problems}). Call ${this.spec.tool} again with every field filled.` },
          effort,
          retries - 1
        )
      }
    } else if (retries > 0) {
      return this.request({ text: `[FORMAT] Answer by calling the ${this.spec.tool} tool.` }, effort, retries - 1)
    }
    throw new TutorError('Clueless got an unexpected reply. Try again.', 'bad_output')
  }

  private userMessage(turn: Turn): BetaMessageParam {
    const content: BetaContentBlockParam[] = []
    if (this.pendingToolUseId) {
      content.push({
        type: 'tool_result',
        tool_use_id: this.pendingToolUseId,
        content: turn.toolError ?? 'Shown to the student.',
        ...(turn.toolError ? { is_error: true } : {})
      })
    }
    for (const image of turn.images ?? []) {
      content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })
    }
    if (turn.text) content.push({ type: 'text', text: turn.text })
    return { role: 'user', content }
  }

  private async send(effort: Effort): Promise<BetaMessage> {
    const structured = this.transport.mode === 'structured'
    const system = structured ? this.spec.system : this.spec.system + toolModeRules(this.spec.tool)
    const params: Record<string, unknown> = {
      model: this.transport.model,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: this.messages,
      output_config: structured ? { effort, format: { type: 'json_schema', schema: this.spec.json } } : { effort }
    }
    if (!structured) {
      params.tools = [{ name: this.spec.tool, description: 'Send your reply. Call this exactly once, with every field filled.', input_schema: this.spec.json }]
      params.tool_choice = { type: 'auto' } // forced tool use isn't allowed on Opus 5.5; the prompt asks for it
    }
    return this.stream(params)
  }

  private async stream(params: Record<string, unknown>): Promise<BetaMessage> {
    const options = { fallbackState: this.fallbackState, signal: AbortSignal.timeout(this.spec.timeoutMs) }
    try {
      if (this.useServerFallbacks) {
        // If a safety classifier declines, the API re-runs the request on a fallback model.
        return await this.client.beta.messages
          .stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, options)
          .finalMessage()
      }
      return await this.client.beta.messages.stream(params, options).finalMessage()
    } catch (err) {
      if (!(err instanceof Anthropic.BadRequestError) || !/fallback|beta|credit/i.test(err.message)) throw err
      if (this.useServerFallbacks) {
        this.log(`${this.spec.tool}: server-side fallbacks not available, continuing without them`)
        this.useServerFallbacks = false
      } else if (this.transport.plainClient && this.client !== (this.transport.plainClient as unknown)) {
        this.log(`${this.spec.tool}: refusal-fallback middleware not available here, continuing without it`)
        this.client = this.transport.plainClient as unknown as StreamingClient
      } else {
        throw err
      }
      return this.stream(params)
    }
  }
}

export class Tracer implements TracerLike {
  private conv: Conversation<TraceWireT> | null = null
  private code = '' // what the conversation is about: the highlight, or code Claude copied from the screen

  constructor(
    private readonly transport: TutorTransport,
    /** Runs Python highlights for exact values; null = Claude writes every trace. */
    private readonly runner: PythonRunner | null = null,
    private readonly log: (line: string) => void = () => {},
    /** Force one effort level for written traces (tests, `npm run trace --effort`); undefined = pick by code size. */
    private readonly effortOverride: Effort | undefined = envEffort()
  ) {}

  /** The conversation so far (for tests and scripts). */
  get messages(): BetaMessageParam[] {
    return this.conv?.messages ?? []
  }

  async ask(input: AskInput): Promise<TraceReply> {
    this.code = normalizeSnippet(input.snippet)
    const conv = (this.conv = this.newConversation())
    const highlight = `The student highlighted this:\n${numberLines(this.code)}`
    const images = input.image ? [input.image] : []

    if (input.animate && this.runner && looksLikePython(this.code)) {
      const plan = await conv.request({ text: `[ANIMATE ON] [RUN]\n${highlight}`, images }, 'low')
      const ran = await this.runPlan(plan)
      if (ran) return ran
      this.log('ask: the run did not work, Claude writes the trace instead')
      return fromTraceWire(await conv.request({ text: '[WRITE IT]' }, this.effortFor(this.code)), this.code)
    }
    const tag = input.animate ? '[ANIMATE ON]' : '[ANIMATE OFF]'
    const effort = input.animate ? this.effortFor(this.code) : 'medium'
    return fromTraceWire(await conv.request({ text: `${tag}\n${highlight}`, images }, effort), this.code)
  }

  async askScreen(input: ScreenQuestion): Promise<TraceReply> {
    this.code = ''
    const conv = (this.conv = this.newConversation())
    const tag = input.guide ? '[GUIDE] [ANIMATE OFF] [SCREEN]' : input.animate ? '[ANIMATE ON] [SCREEN]' : '[ANIMATE OFF] [SCREEN]'
    const images = input.image ? [input.image] : []
    const reply = fromTraceWire(await conv.request({ text: `${tag} ${input.question}`, images }, 'medium'), '')
    if (reply.trace) this.code = reply.trace.code // follow-ups are about the code it animated
    return reply
  }

  async followUp(text: string, animate: boolean): Promise<TraceReply> {
    const conv = this.conv
    if (!conv) throw new TutorError('Ask about a highlight first.', 'api')
    if (animate && this.runner && this.code && looksLikePython(this.code)) {
      const plan = await conv.request({ text: `[ANIMATE ON] [RUN] [FOLLOW-UP] ${text}` }, 'low')
      const wantsRun = Boolean(plan.run.setup.trim() || plan.run.call.trim())
      return (wantsRun && (await this.runPlan(plan))) || { message: plan.message.trim(), trace: null }
    }
    const tag = animate ? '[ANIMATE ON] [FOLLOW-UP]' : '[ANIMATE OFF] [FOLLOW-UP]'
    const effort = animate && this.code ? this.effortFor(this.code) : 'medium'
    const reply = fromTraceWire(await conv.request({ text: `${tag} ${text}` }, effort), this.code)
    if (reply.trace && !this.code) this.code = reply.trace.code
    return reply
  }

  private newConversation(): Conversation<TraceWireT> {
    return new Conversation(this.transport, TRACE_SPEC, this.log)
  }

  /** Run the code with Claude's inputs, then get the words. One retry with the error if it won't start. */
  private async runPlan(plan: TraceWireT, retries = 1): Promise<TraceReply | null> {
    if (!this.runner || !this.conv || (plan.language && plan.language.toLowerCase() !== 'python')) return null
    let why: string
    try {
      const run = await this.runner.trace(this.code, plan.run)
      const trace = run.setupError ? null : toCodeTrace(run, this.code)
      if (trace) {
        const notes = [run.stopped && `stopped at the ${run.stopped} limit`, run.error].filter(Boolean).join(', ')
        this.log(`run: ${trace.steps.length} steps${notes ? ` (${notes})` : ''}`)
        return this.narrate(trace, plan)
      }
      why = run.setupError || run.error || 'nothing in the highlighted code ran'
    } catch (err) {
      this.log(`run: ${(err as Error).message}`)
      return null
    }
    this.log(`run: failed (${why})`)
    if (retries <= 0) return null
    return this.runPlan(await this.conv.request({ text: `[RUN FAILED] ${why}` }, 'low'), retries - 1)
  }

  /** The app recorded the steps; Claude writes one line per step, the intro and the recap.
   *  If that fails, the app writes the lines itself so the animation still plays. */
  private async narrate(trace: CodeTrace, plan: TraceWireT): Promise<TraceReply> {
    try {
      const conv = new Conversation(this.transport, NARRATE_SPEC, this.log)
      const words = await conv.request({ text: describeRun(trace, plan.intro) }, 'low')
      if (words.says.length !== trace.steps.length) this.log(`narrate: ${words.says.length} lines for ${trace.steps.length} steps, filling the gaps`)
      return {
        message: words.message.trim() || plan.message.trim(),
        trace: withNarration(trace, words.says, words.intro || plan.intro)
      }
    } catch (err) {
      this.log(`narrate: ${(err as Error).message}; the app writes the lines`)
      return { message: plan.message.trim(), trace: withNarration(trace, [], plan.intro) }
    }
  }

  private effortFor(code: string): Effort {
    return this.effortOverride ?? traceEffort(code)
  }
}

/** The recorded run, compactly, for [NARRATE]. */
function describeRun(trace: CodeTrace, intro: string): string {
  const names = new Map(trace.entities.map((e) => [e.id, e]))
  const show = (id: string, v: EntityValue): string => {
    const kind = names.get(id)?.kind
    const name = names.get(id)?.name ?? id
    if (kind === 'value') return `${name} = ${v.scalar}`
    if (kind === 'map') return `${name} = {${v.entries.map((e) => `${e.key}: ${e.value}`).join(', ')}}`
    if (kind === 'grid') return `${name} = [${v.rows.map((r) => `[${r.join(', ')}]`).join(', ')}]`
    if (kind === 'set') return `${name} = {${v.items.join(', ')}}`
    return `${name} = [${v.items.join(', ')}]`
  }
  const steps = trace.steps.map((s, i) => {
    const what = s.focus || trace.code.split('\n')[s.line - 1]?.trim() || ''
    const result = s.result ? ` -> ${s.result}` : ''
    const updates = s.updates.length ? ` | ${s.updates.map((u) => show(u.entity, u.value)).join('; ')}` : ''
    return `${i + 1}. line ${s.line}, ${s.kind}: ${what}${result}${updates}`
  })
  return [
    'The code:',
    numberLines(trace.code),
    '',
    intro ? `The input you chose earlier: ${intro}` : '',
    `The ${trace.steps.length} recorded steps, in order (write exactly ${trace.steps.length} "says"):`,
    ...steps
  ]
    .filter((l, i, all) => l || all[i - 1])
    .join('\n')
}

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** CLUELESS_TRACE_EFFORT=max (in .env) forces one effort level for every written trace. */
function envEffort(env: Record<string, string | undefined> = process.env): Effort | undefined {
  const value = env.CLUELESS_TRACE_EFFORT?.trim().toLowerCase()
  return EFFORTS.find((e) => e === value)
}

/** Picked from the size of the highlight. Measured on bubble sort: medium and high both took ~16 s and
 *  traced it correctly; max took ~88 s for a few extra "loop finished" steps. So max is opt-in only. */
export function traceEffort(code: string): Effort {
  const lines = code.split(String.fromCharCode(10)).filter((l) => l.trim()).length
  return lines <= 14 ? 'medium' : 'high'
}
