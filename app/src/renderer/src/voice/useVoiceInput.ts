// The microphone side of voice: records with MediaRecorder, streams the chunks to the main process
// (which talks to Deepgram), shows live text, and hands the final transcript to `onFinal` once.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceStateEvent, VoiceTranscript } from '../../../shared/contracts'
import { api } from '../api'

export type VoiceInputState = 'idle' | 'starting' | 'listening' | 'finishing' | 'error'

export interface VoiceInput {
  state: VoiceInputState
  /** Live text: `heard` is settled, `interim` may still change. */
  heard: string
  interim: string
  /** Mic loudness 0..1, for the activity ring. */
  level: number
  /** A short message after an error or when nothing was heard. */
  notice: string | null
  start(): Promise<void>
  stop(): void
  cancel(): void
}

// Electron is always Chromium, which records webm/opus on macOS and Windows. Checked anyway, with
// Ogg/Opus as a fallback; Deepgram reads either container without being told the encoding.
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
const CHUNK_MS = 250

interface Recording {
  id: string
  stream: MediaStream
  recorder: MediaRecorder | null
  audio: AudioContext | null
  raf: number
  sending: Promise<void> // keeps chunks in order
  submitted: boolean
}

export function useVoiceInput(onFinal: (text: string) => void): VoiceInput {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [heard, setHeard] = useState('')
  const [interim, setInterim] = useState('')
  const [level, setLevel] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  const rec = useRef<Recording | null>(null)
  const pendingId = useRef<string | null>(null) // set while asking for the mic, before `rec` exists
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  /** Turn the mic off and free everything. Safe to call more than once. */
  const release = useCallback((): void => {
    const r = rec.current
    rec.current = null
    pendingId.current = null
    setLevel(0)
    if (!r) return
    cancelAnimationFrame(r.raf)
    if (r.recorder && r.recorder.state !== 'inactive') {
      r.recorder.ondataavailable = null
      r.recorder.onstop = null
      try {
        r.recorder.stop()
      } catch {
        // already stopped
      }
    }
    r.stream.getTracks().forEach((t) => t.stop())
    void r.audio?.close().catch(() => {})
  }, [])

  const reset = (next: VoiceInputState, message: string | null = null): void => {
    setState(next)
    setNotice(message)
    setHeard('')
    setInterim('')
  }

  // Events from the main process. Anything for an older recording is ignored.
  useEffect(() => {
    const offText = api.onVoiceTranscript((t: VoiceTranscript) => {
      const r = rec.current
      if (!r || t.id !== r.id || r.submitted) return
      if (!t.final) {
        setHeard(t.text.slice(0, t.text.length - t.interim.length).trim())
        setInterim(t.interim)
        return
      }
      r.submitted = true // a final transcript is submitted once, whatever comes after
      const text = t.text.trim()
      release()
      reset('idle')
      if (text) onFinalRef.current(text)
    })
    const offState = api.onVoiceState((e: VoiceStateEvent) => {
      const r = rec.current
      if (!r || e.id !== r.id) return
      if (e.state === 'listening') {
        setState((s) => (s === 'starting' ? 'listening' : s))
      } else if (e.state === 'error') {
        release()
        reset('error', e.message)
      } else if (!r.submitted) {
        release()
        reset('idle', e.reason === 'no-speech' ? "Didn't catch that. Try again?" : null)
      }
    })
    return () => {
      offText()
      offState()
    }
  }, [release])

  // Closing or hiding the panel, or leaving the session: never leave the mic on.
  useEffect(() => {
    const drop = (): void => {
      const id = rec.current?.id ?? pendingId.current
      if (!id) return
      api.voiceCancel(id)
      release()
      reset('idle')
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') drop()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      drop()
    }
  }, [release])

  const start = useCallback(async (): Promise<void> => {
    if (rec.current || pendingId.current) return // already recording (repeated clicks)
    const id = crypto.randomUUID()
    pendingId.current = id
    setState('starting')
    setNotice(null)
    setHeard('')
    setInterim('')

    const fail = (message: string): void => {
      if (pendingId.current !== id) return
      pendingId.current = null
      reset('error', message)
    }

    const mime = typeof MediaRecorder !== 'undefined' ? MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) : undefined
    if (!mime || !navigator.mediaDevices?.getUserMedia) return fail("This computer can't record audio here.")

    if (!(await api.micAccess().catch(() => false))) {
      return fail('Microphone access is off. Allow Clueless (or your terminal) in your privacy settings.')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      return fail(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone access was blocked. Allow it in your privacy settings and try again.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No microphone found. Plug one in and try again.'
            : name === 'NotReadableError'
              ? 'The microphone is busy in another app.'
              : "Couldn't start the microphone."
      )
    }
    if (pendingId.current !== id) {
      stream.getTracks().forEach((t) => t.stop()) // cancelled while we were asking
      return
    }

    const r: Recording = { id, stream, recorder: null, audio: null, raf: 0, sending: Promise.resolve(), submitted: false }
    rec.current = r
    pendingId.current = null
    // A mic unplugged mid-recording.
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (rec.current !== r) return
      api.voiceCancel(id)
      release()
      reset('error', 'The microphone disconnected.')
    })

    api.voiceStart(id)
    const recorder = new MediaRecorder(stream, { mimeType: mime })
    r.recorder = recorder
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return
      r.sending = r.sending.then(async () => {
        const buf = await e.data.arrayBuffer()
        if (rec.current === r) api.voiceAudio(id, buf)
      })
    }
    recorder.start(CHUNK_MS)
    meter(r, setLevel)
  }, [release])

  const stop = useCallback((): void => {
    const r = rec.current
    if (!r) {
      // Still asking for the mic: just give up.
      if (pendingId.current) {
        pendingId.current = null
        reset('idle')
      }
      return
    }
    if (!r.recorder || r.recorder.state === 'inactive') return
    setState('finishing')
    cancelAnimationFrame(r.raf)
    setLevel(0)
    // The recorder hands over its last chunk on stop; send it, then ask for the final transcript.
    r.recorder.onstop = () => {
      r.stream.getTracks().forEach((t) => t.stop())
      void r.audio?.close().catch(() => {})
      void r.sending.then(() => {
        if (rec.current === r) api.voiceStop(r.id)
      })
    }
    r.recorder.stop()
  }, [])

  const cancel = useCallback((): void => {
    const id = rec.current?.id ?? pendingId.current
    if (id) api.voiceCancel(id)
    release()
    reset('idle')
  }, [release])

  return { state, heard, interim, level, notice, start, stop, cancel }
}

/** Loudness meter for the activity ring, about 12 updates a second. */
function meter(r: Recording, setLevel: (n: number) => void): void {
  try {
    const audio = new AudioContext()
    const analyser = audio.createAnalyser()
    analyser.fftSize = 512
    audio.createMediaStreamSource(r.stream).connect(analyser)
    r.audio = audio
    const data = new Uint8Array(analyser.fftSize)
    let last = 0
    const tick = (t: number): void => {
      if (t - last > 80) {
        last = t
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += ((v - 128) / 128) ** 2
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
      }
      r.raf = requestAnimationFrame(tick)
    }
    r.raf = requestAnimationFrame(tick)
  } catch {
    // no meter: recording still works
  }
}
