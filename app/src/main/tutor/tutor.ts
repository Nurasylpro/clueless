// Tutor engine: one Tutor = one problem session with Claude.
// No Electron imports here, so scripts/try-tutor.ts and the tests can use it directly.
import Anthropic from '@anthropic-ai/sdk'
import type { BetaContentBlockParam, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { z } from 'zod'
import { WireReply } from '../../shared/schema'
import type { TutorReplyT } from '../../shared/contracts'
import { SYSTEM_PROMPT } from './prompt'

export const DEFAULT_MODEL = 'claude-opus-5-5'

export type Tag =
  | 'STUDENT'
  | 'HINT'
  | 'WHAT NEXT'
  | 'RECALL'
  | 'CHECK MY WORK'
  | 'STUCK'
  | 'REVEAL'
  | 'RECAP'

export interface ImageInput {
  data: string // base64, no data: prefix
  mediaType: 'image/jpeg' | 'image/png'
}

export interface StartInput {
  image?: ImageInput
  text?: string // the student's typed question, or the problem as text
  history?: string // [STUDENT HISTORY] summary
}

export interface SendInput {
  tag: Tag
  text?: string
  image?: ImageInput
  notes?: string[] // extra lines such as [CHECKER] or [SUBJECT]
}

/** What the session controller needs from a tutor (tests swap in a fake). */
export interface TutorLike {
  start(input: StartInput): Promise<TutorReplyT>
  send(input: SendInput): Promise<TutorReplyT>
}

export class TutorError extends Error {
  constructor(
    message: string,
    readonly code: 'refusal' | 'max_tokens' | 'bad_output' | 'api'
  ) {
    super(message)
  }
}

/** The reply schema as plain JSON Schema. Structured outputs accept anyOf but not oneOf. */
export const replySchema = (() => {
  const schema = JSON.parse(JSON.stringify(z.toJSONSchema(WireReply)).replaceAll('"oneOf"', '"anyOf"'))
  delete schema.$schema
  return schema as Record<string, unknown>
})()

export class Tutor implements TutorLike {
  /** The whole conversation. Append-only: earlier turns are never edited. */
  readonly messages: BetaMessageParam[] = []
  private useFallbacks = true

  constructor(
    private readonly client: Anthropic,
    private readonly model = DEFAULT_MODEL,
    private readonly log: (line: string) => void = () => {}
  ) {}

  async start(input: StartInput): Promise<TutorReplyT> {
    const lines = ['[NEW PROBLEM]']
    if (input.image) lines.push("The screenshot shows the student's screen. Find the problem they're working on.")
    if (input.text) lines.push(`Student's note: ${input.text}`)
    if (input.history) lines.push(`[STUDENT HISTORY] ${input.history}`)
    // The first call is the hard one (understand the problem, write the hidden solution), so it
    // thinks harder. Later turns are short and run at low effort for speed.
    return this.request(this.userMessage(lines.join('\n'), input.image), 'medium')
  }

  async send(input: SendInput): Promise<TutorReplyT> {
    const lines = [...(input.notes ?? [])]
    lines.push(input.text ? `[${input.tag}] ${input.text}` : `[${input.tag}]`)
    return this.request(this.userMessage(lines.join('\n'), input.image), 'low')
  }

  private userMessage(text: string, image?: ImageInput): BetaMessageParam {
    const content: BetaContentBlockParam[] = []
    if (image) {
      content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })
    }
    content.push({ type: 'text', text })
    return { role: 'user', content }
  }

  private async request(user: BetaMessageParam, effort: 'low' | 'medium'): Promise<TutorReplyT> {
    this.messages.push(user)
    const started = Date.now()
    let response
    try {
      response = await this.create(effort)
    } catch (err) {
      // Don't leave a dangling user turn: the conversation must alternate user/assistant.
      this.messages.pop()
      throw err instanceof TutorError ? err : new TutorError(errorMessage(err), 'api')
    }

    // Keep Claude's whole reply (thinking blocks included) so the history stays append-only.
    this.messages.push({ role: 'assistant', content: response.content as unknown as BetaContentBlockParam[] })
    const usage = response.usage
    this.log(
      `tutor: ${effort} ${Date.now() - started}ms in=${usage.input_tokens} cached=${usage.cache_read_input_tokens ?? 0} out=${usage.output_tokens}`
    )

    if (response.stop_reason === 'refusal') {
      throw new TutorError("Clueless can't help with this one.", 'refusal')
    }
    if (response.stop_reason === 'max_tokens') {
      throw new TutorError('The reply was cut off. Try again.', 'max_tokens')
    }
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    return parseReply(text)
  }

  private async create(effort: 'low' | 'medium') {
    const params = {
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: this.messages,
      // Auto-caches up to the latest block, so each follow-up re-reads the screenshot from cache.
      cache_control: { type: 'ephemeral' as const },
      output_config: { effort, format: { type: 'json_schema' as const, schema: replySchema } }
    }
    if (!this.useFallbacks) return this.client.beta.messages.create(params)
    try {
      // If a safety classifier declines, the API re-runs the request on a fallback model.
      return await this.client.beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default'
      })
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) {
        this.log('tutor: fallbacks not available on this account, continuing without them')
        this.useFallbacks = false
        return this.client.beta.messages.create(params)
      }
      throw err
    }
  }
}

export function parseReply(text: string): TutorReplyT {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new TutorError('Clueless got a garbled reply. Try again.', 'bad_output')
  }
  const parsed = WireReply.safeParse(json)
  if (!parsed.success) throw new TutorError('Clueless got an unexpected reply. Try again.', 'bad_output')
  return fromWire(parsed.data)
}

/** Wire format ("" / -1 / "none" placeholders) -> app types (null). */
export function fromWire(w: z.infer<typeof WireReply>): TutorReplyT {
  const t = w.turn
  return {
    problem: w.problem && { ...w.problem, language: w.problem.language.trim() || null },
    turn: {
      kind: t.kind,
      message: t.message,
      hintLevel: Math.max(0, Math.min(5, Math.round(t.hintLevel))),
      verdict: t.verdict,
      plan: t.plan,
      gap: t.gap.type === 'none' ? null : { type: t.gap.type, topic: t.gap.topic },
      expects: t.expects,
      choices: t.choices,
      visual: t.visual.frames.length ? t.visual : null,
      check:
        t.check.kind === 'none' || !t.check.reference.trim()
          ? null
          : {
              kind: t.check.kind,
              reference: t.check.reference,
              variable: t.check.variable.trim() || null,
              unit: t.check.unit.trim() || null
            }
    },
    recap: w.recap && { ...w.recap, similarProblem: w.recap.similarProblem.trim() || null }
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Your Claude API key was rejected. Check ANTHROPIC_API_KEY.'
  if (err instanceof Anthropic.RateLimitError) return 'Claude is rate-limiting us. Wait a moment and try again.'
  if (err instanceof Anthropic.APIConnectionError) return "Can't reach Claude. Check your internet connection."
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status}): ${err.message}`
  return err instanceof Error ? err.message : String(err)
}
