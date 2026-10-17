// Where Claude runs: the Claude API (ANTHROPIC_API_KEY) or Claude in Amazon Bedrock (AWS credentials).
// No Electron imports, so scripts/try-tutor.mts uses this too.
import Anthropic, { betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk'
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import type { ClaudeClient, TutorTransport } from './tutor'

export type Provider = 'anthropic' | 'bedrock'

type Env = Record<string, string | undefined>

/** CLUELESS_PROVIDER wins; otherwise an Anthropic key means the Claude API and AWS settings mean Bedrock. */
export function detectProvider(env: Env = process.env): Provider | null {
  const forced = env.CLUELESS_PROVIDER?.trim().toLowerCase()
  if (forced === 'anthropic' || forced === 'bedrock') return forced
  if (env.ANTHROPIC_API_KEY) return 'anthropic'
  if (env.AWS_BEARER_TOKEN_BEDROCK || env.AWS_ACCESS_KEY_ID || env.AWS_PROFILE) return 'bedrock'
  return null
}

export function defaultModel(provider: Provider): string {
  // Bedrock model IDs carry an `anthropic.` prefix.
  return provider === 'bedrock' ? 'anthropic.claude-opus-5-5' : 'claude-opus-5-5'
}

export function bedrockRegion(env: Env = process.env): string {
  return env.AWS_REGION || env.AWS_DEFAULT_REGION || 'us-east-1'
}

export interface ProviderInfo {
  provider: Provider
  model: string
  region: string | null
}

export function providerInfo(env: Env = process.env): ProviderInfo | null {
  const provider = detectProvider(env)
  if (!provider) return null
  return {
    provider,
    model: env.CLUELESS_MODEL?.trim() || defaultModel(provider),
    region: provider === 'bedrock' ? bedrockRegion(env) : null
  }
}

/**
 * Build the transport the Tutor uses. Returns null when nothing is configured.
 * - Claude API: structured outputs + server-side refusal fallbacks.
 * - Bedrock: no structured outputs there, so Claude answers through a `reply` tool; refusal
 *   fallbacks run client-side through the SDK middleware (with a plain client kept as backup).
 */
export function createTransport(env: Env = process.env): (TutorTransport & ProviderInfo) | null {
  const info = providerInfo(env)
  if (!info) return null

  if (info.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    return { ...info, client: client as unknown as ClaudeClient, mode: 'structured', serverFallbacks: true }
  }

  const options = { awsRegion: info.region ?? undefined, ...(env.AWS_PROFILE ? { awsProfile: env.AWS_PROFILE } : {}) }
  const plain = new AnthropicBedrockMantle(options)
  const fallbackModel = env.CLUELESS_FALLBACK_MODEL?.trim() || 'anthropic.claude-opus-4-8'
  const client =
    fallbackModel === info.model
      ? plain
      : new AnthropicBedrockMantle({ ...options, middleware: [betaRefusalFallbackMiddleware([{ model: fallbackModel }])] })
  return {
    ...info,
    client: client as unknown as ClaudeClient,
    plainClient: plain as unknown as ClaudeClient,
    mode: 'tool',
    serverFallbacks: false
  }
}
