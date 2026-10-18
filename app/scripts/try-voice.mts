// Check the voice keys in app/.env, end to end, without Electron:
//   1. ElevenLabs reads a sentence aloud (the voice that reads answers and animation steps)
//   2. that audio is streamed into Deepgram through the app's own mic code (VoiceManager), the
//      same way the island streams your voice, and the words must come back.
//
//   npm run voice-check
//   npm run voice-check -- "your own sentence"
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { VoiceStateEvent, VoiceTranscript } from '../src/shared/contracts'
import { loadEnvFiles } from '../src/main/env'
import { ElevenLabs } from '../src/main/voice/elevenlabs'
import { VoiceManager, type SocketLike } from '../src/main/voice/deepgram'

loadEnvFiles([join(process.cwd(), '.env')])
const sentence = process.argv.slice(2).join(' ').trim() || 'Is one already in seen? Yes, so the function returns true.'
const ok = (s: string): string => `\u001b[32m✓\u001b[0m ${s}`
const bad = (s: string): string => `\u001b[31m✗\u001b[0m ${s}`
let failed = false

// ---------- 1. ElevenLabs ----------
console.log('\n1. ElevenLabs (reading aloud)')
if (!process.env.ELEVENLABS_API_KEY?.trim()) {
  console.log(bad('ELEVENLABS_API_KEY is empty: answers will be read with the computer\'s own voice.'))
  failed = true
}
const eleven = new ElevenLabs(() => process.env, fetch, (line) => console.log(`   (${line})`))
const started = Date.now()
const tts = await eleven.speak({ text: sentence })
let audio: ArrayBuffer | null = null
if (tts.ok) {
  audio = tts.audio
  const file = join(tmpdir(), 'clueless-voice-check.mp3')
  writeFileSync(file, Buffer.from(tts.audio))
  console.log(ok(`spoke "${sentence}" in ${Date.now() - started} ms (${Math.round(tts.audio.byteLength / 1024)} KB ${tts.mime})`))
  console.log(`   voice: ${process.env.ELEVENLABS_VOICE || '(the first of the preferred voices)'} · saved to ${file} (play it to hear the voice)`)
} else {
  console.log(bad(`${tts.reason}: ${tts.message}`))
  failed = true
}

// ---------- 2. Deepgram ----------
console.log('\n2. Deepgram (the mic)')
if (!process.env.DEEPGRAM_API_KEY?.trim()) {
  console.log(bad('DEEPGRAM_API_KEY is empty: the mic button will say so.'))
  failed = true
} else if (!audio) {
  console.log('   skipped: needs the ElevenLabs audio to have something to listen to')
} else {
  const heard = await new Promise<{ text: string; ms: number; error?: string }>((resolve) => {
    const t0 = Date.now()
    let last = ''
    const done = (error?: string): void => resolve({ text: last, ms: Date.now() - t0, error })
    const voice = new VoiceManager({
      apiKey: () => process.env.DEEPGRAM_API_KEY?.trim() || undefined,
      events: {
        transcript: (t: VoiceTranscript) => {
          last = t.text
          if (t.final) done()
        },
        state: (e: VoiceStateEvent) => {
          if (e.state === 'error') done(e.message)
          if (e.state === 'closed') done(e.reason === 'no-speech' ? 'Deepgram heard no speech' : undefined)
        }
      },
      makeSocket: (url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike,
      // Like the app: listen for the names in the code being discussed.
      keyterms: () => ['seen', 'nums']
    })
    const id = 'voice-check'
    voice.start(id)
    // Stream it like a microphone would: small chunks in real time (128 kbps mp3 = 16 KB a second), then stop.
    const bytes = new Uint8Array(audio!)
    const chunk = 4096
    let at = 0
    const timer = setInterval(() => {
      if (at >= bytes.length) {
        clearInterval(timer)
        setTimeout(() => voice.stop(id), 800)
        return
      }
      voice.audio(id, bytes.slice(at, at + chunk).buffer)
      at += chunk
    }, 250)
    setTimeout(() => {
      clearInterval(timer)
      voice.cancelAll()
      done('no final transcript within 20 s')
    }, 20_000)
  })
  if (heard.error && !heard.text) {
    console.log(bad(heard.error))
    failed = true
  } else {
    const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    const same = norm(heard.text).includes(norm(sentence).split(' ').slice(0, 4).join(' '))
    console.log((same ? ok : bad)(`heard "${heard.text}" (${heard.ms} ms)`))
    if (!same) failed = true
  }
}

console.log(failed ? '\nSomething needs a look (see above).' : '\nBoth voice keys work.')
process.exit(failed ? 1 : 0)
