// "Ask" on highlighted text: one conversation with Claude per highlight. With Animate on it runs
// at max effort and comes back with a full step-by-step trace of the code. No Electron imports,
// so scripts/try-trace.mts and the tests use it directly.
import Anthropic, { BetaFallbackState } from '@anthropic-ai/sdk'
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { z } from 'zod'
import { fromTraceWire, normalizeSnippet, numberLines, TraceWire, type TraceReply } from '../../shared/trace'
import { errorMessage, TutorError, type ImageInput, type TutorTransport } from '../tutor/tutor'
import type { AskInput, TracerLike } from '../../shared/islandController'
import { TRACE_PROMPT } from './prompt'

/** Max effort can think for a long time, so stream (no HTTP timeout) and give it room. */
const MAX_TOKENS = 64000

export const traceSchema = (() => {
  const schema = JSON.parse(JSON.stringify(z.toJSONSchema(TraceWire)).replaceAll('"oneOf"', '"anyOf"'))
  delete schema.$schema
  return schema as Record<string, unknown>
})()

const REPLY_TOOL = {
  name: 'reply',
  description: 'Send your reply to the student. Call this exactly once, with every field filled.',
  input_schema: traceSchema
}

const TOOL_MODE_RULES =
  '\n\n# How to answer\nAlways answer by calling the `reply` tool exactly once, with every field filled. Write nothing outside the tool call.'

/** The streaming slice of an Anthropic or AnthropicBedrockMantle client. */
interface StreamingClient {
  beta: {
    messages: {
      stream(
        params: Record<string, unknown>,
        options?: { fallbackState?: BetaFallbackState }
      ): { finalMessage(): Promise<BetaMessage> }
    }
  }
}

type Effort = 'high' | 'max'

interface Turn {
  text: string
  images?: ImageInput[]
  toolError?: string
}

export class Tracer implements TracerLike {
  /** The whole conversation about this highlight. Append-only. */
  readonly messages: BetaMessageParam[] = []
  private readonly fallbackState = new BetaFallbackState()
  private pendingToolUseId: string | null = null
  private code = ''
  private client: StreamingClient
  private useServerFallbacks: boolean

  constructor(
    private readonly transport: TutorTransport,
    private readonly log: (line: string) => void = () => {}
  ) {
    this.client = transport.client as unknown as StreamingClient
    this.useServerFallbacks = transport.serverFallbacks
  }

  ask(input: AskInput): Promise<TraceReply> {
    this.code = normalizeSnippet(input.snippet)
    const text = [
      input.animate ? '[ANIMATE ON]' : '[ANIMATE OFF]',
      'The student highlighted this:',
      numberLines(this.code)
    ].join('\n')
    return this.request({ text, images: input.image ? [input.image] : [] }, input.animate ? 'max' : 'high')
  }

  followUp(text: string, animate: boolean): Promise<TraceReply> {
    return this.request({ text: `${animate ? '[ANIMATE ON]' : '[ANIMATE OFF]'} [FOLLOW-UP] ${text}` }, animate ? 'max' : 'high')
  }

  private async request(turn: Turn, effort: Effort, retries = 1): Promise<TraceReply> {
    this.messages.push(this.userMessage(turn))
    const started = Date.now()
    let response: BetaMessage
    try {
      response = await this.send(effort)
    } catch (err) {
      this.messages.pop() // keep the conversation alternating user/assistant
      throw err instanceof TutorError ? err : new TutorError(errorMessage(err), 'api')
    }

    this.pendingToolUseId = null
    this.messages.push({ role: 'assistant', content: response.content as unknown as BetaContentBlockParam[] })
    const u = response.usage
    this.log(`trace: ${effort} ${Date.now() - started}ms in=${u.input_tokens} cached=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens}`)

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
      const parsed = TraceWire.safeParse(json)
      if (!parsed.success) throw new TutorError('Clueless got an unexpected reply. Try again.', 'bad_output')
      return fromTraceWire(parsed.data, this.code)
    }

    // Bedrock: the reply is the `reply` tool's input. One retry if it's missing or malformed.
    const call = response.content.find((b) => b.type === 'tool_use' && b.name === REPLY_TOOL.name)
    if (call && call.type === 'tool_use') {
      this.pendingToolUseId = call.id
      const parsed = TraceWire.safeParse(call.input)
      if (parsed.success) return fromTraceWire(parsed.data, this.code)
      if (retries > 0) {
        const problems = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        this.log(`trace: reply didn't match the schema (${problems}), asking again`)
        return this.request({ text: '', toolError: `That reply didn't match the schema (${problems}). Call reply again with every field filled.` }, effort, retries - 1)
      }
    } else if (retries > 0) {
      return this.request({ text: '[FORMAT] Answer by calling the reply tool.' }, effort, retries - 1)
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
    const params: Record<string, unknown> = {
      model: this.transport.model,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: structured ? TRACE_PROMPT : TRACE_PROMPT + TOOL_MODE_RULES, cache_control: { type: 'ephemeral' } }],
      messages: this.messages,
      output_config: structured ? { effort, format: { type: 'json_schema', schema: traceSchema } } : { effort }
    }
    if (!structured) {
      params.tools = [REPLY_TOOL]
      params.tool_choice = { type: 'auto' } // forced tool use isn't allowed on Opus 5.5; the prompt asks for it
    }
    return this.stream(params)
  }

  private async stream(params: Record<string, unknown>): Promise<BetaMessage> {
    const options = { fallbackState: this.fallbackState }
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
        this.log('trace: server-side fallbacks not available, continuing without them')
        this.useServerFallbacks = false
      } else if (this.transport.plainClient && this.client !== (this.transport.plainClient as unknown)) {
        this.log('trace: refusal-fallback middleware not available here, continuing without it')
        this.client = this.transport.plainClient as unknown as StreamingClient
      } else {
        throw err
      }
      return this.stream(params)
    }
  }
}
