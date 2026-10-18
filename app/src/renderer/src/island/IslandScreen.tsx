// The island: a dark pill at the top of the screen.
//   Logo · Mic · Animate · Voice · Expand
// Highlight code anywhere -> Ask (next to the cursor). Or open the card (Expand) and type, or talk.
// Animate on + code: the whole screen becomes the animation right away; its recap waits in the card.
// Otherwise the answer opens in the card. Voice on: answers, and every animation step, are read aloud.
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { IslandView } from '../../../shared/contracts'
import { toSpeech } from '../../../shared/speechText'
import { ChevronDownIcon, CloseIcon, Logo, MicIcon, PlayIcon, SendIcon, SpeakerIcon } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { cx } from '../components/ui'
import { speech } from '../voice/speaker'
import { useVoiceInput, type VoiceInput } from '../voice/useVoiceInput'
import { islandApi, isIslandMock } from './api'
import { useFakeVoiceInput } from './fakeVoice'
import { TraceOverlay } from './TraceOverlay'

/** The browser preview has no Deepgram: it pretends you said something. */
const useMic: (onFinal: (text: string) => void) => VoiceInput = isIslandMock ? useFakeVoiceInput : useVoiceInput

export function IslandScreen() {
  const view = useIslandView()
  if (!view) return null
  if (view.phase === 'playing' && view.trace) {
    return <TraceOverlay key={view.playId} trace={view.trace} voice={view.voice} onClose={() => islandApi.finishAnimation()} />
  }
  return <IslandShell view={view} />
}

export function useIslandView(): IslandView | null {
  const [view, setView] = useState<IslandView | null>(null)
  useEffect(() => {
    void islandApi.getView().then((v) => {
      setView(v)
      restoreSwitches(v)
    })
    return islandApi.onView(setView)
  }, [])
  return view
}

/** Animate and Voice are remembered between launches. */
function restoreSwitches(view: IslandView): void {
  try {
    const animate = localStorage.getItem('clueless.animate')
    const voice = localStorage.getItem('clueless.voice')
    if (animate !== null && (animate === '1') !== view.animate) islandApi.setAnimate(animate === '1')
    if (voice !== null && (voice === '1') !== view.voice) islandApi.setVoice(voice === '1')
  } catch {
    // storage unavailable: the defaults
  }
}

function remember(key: 'animate' | 'voice', on: boolean): void {
  try {
    localStorage.setItem(`clueless.${key}`, on ? '1' : '0')
  } catch {
    // storage unavailable: it just won't be remembered
  }
}

/** The pill, plus the card when it's open. Reports its size so the window fits it exactly. */
export function IslandShell({ view }: { view: IslandView }) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const report = (): void => {
      const r = el.getBoundingClientRect()
      islandApi.resize({ width: Math.ceil(r.width), height: Math.ceil(r.height) })
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const reading = useReadAloud(view)
  const mic = useMic(useCallback((text: string) => islandApi.askText(text), []))
  const listening = mic.state === 'starting' || mic.state === 'listening' || mic.state === 'finishing'

  const toggleMic = useCallback((): void => {
    if (listening) return mic.stop() // stop now and send what was heard
    speech.stop() // half-duplex: talking interrupts Clueless
    if (!view.expanded) islandApi.setExpanded(true) // your words show in the card as you speak
    void mic.start()
  }, [listening, mic, view.expanded])

  // Ctrl/Cmd+Shift+1 from anywhere.
  const toggleRef = useRef(toggleMic)
  toggleRef.current = toggleMic
  useEffect(() => islandApi.onMicToggle(() => toggleRef.current()), [])

  // Hidden with the hotkey: stop talking and listening right away.
  useEffect(() => {
    const onHidden = (): void => {
      if (document.visibilityState !== 'hidden') return
      speech.stop()
      mic.cancel()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [mic])

  return (
    <div ref={root} className="inline-flex flex-col items-center gap-2 p-2.5 text-zinc-100" data-app-ready>
      <Pill view={view} mic={mic} listening={listening} onMic={toggleMic} />
      <AnimatePresence initial={false}>
        {view.expanded && (
          <motion.div
            key="card"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{ transformOrigin: 'top center' }}
          >
            <Card view={view} mic={mic} listening={listening} reading={reading} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const DARK = 'border border-white/10 bg-zinc-900/90 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur'
const ROUND = 'flex h-9 items-center justify-center rounded-full transition-colors'

function Pill({ view, mic, listening, onMic }: { view: IslandView; mic: VoiceInput; listening: boolean; onMic: () => void }) {
  const thinking = view.phase === 'thinking'
  return (
    <div className={cx('flex h-12 items-center gap-1.5 rounded-full pl-1.5 pr-1.5', DARK)}>
      <div
        className={cx('flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-zinc-950', thinking && 'animate-pulse')}
        title={thinking ? 'Thinking…' : 'Clueless'}
      >
        <Logo size={19} />
      </div>
      {thinking && !view.expanded && <ThinkingChip since={view.busySince} animate={view.animate} />}
      <MicButton mic={mic} listening={listening} onMic={onMic} />
      <Switch
        label="Animate"
        on={view.animate}
        onChange={(on) => {
          remember('animate', on)
          islandApi.setAnimate(on)
        }}
        title={view.animate ? 'Animate is on: code answers play step by step on the full screen' : 'Animate is off: answers are text only'}
      />
      <Switch
        label="Voice"
        icon={<SpeakerIcon size={14} />}
        on={view.voice}
        onChange={(on) => {
          remember('voice', on)
          if (!on) speech.stop()
          islandApi.setVoice(on)
        }}
        title={view.voice ? 'Voice is on: answers and every animation step are read aloud' : 'Voice is off: nothing is read aloud'}
      />
      <button
        type="button"
        onClick={() => islandApi.setExpanded(!view.expanded)}
        title={view.expanded ? 'Close' : 'Open: type a question, see the last answer'}
        aria-expanded={view.expanded}
        className={cx(ROUND, 'w-9 bg-white/[0.07] hover:bg-white/[0.12]')}
      >
        <ChevronDownIcon size={16} className={cx('transition-transform duration-300', view.expanded && 'rotate-180')} />
      </button>
    </div>
  )
}

function MicButton({ mic, listening, onMic }: { mic: VoiceInput; listening: boolean; onMic: () => void }) {
  const title = listening
    ? 'Listening. Pause to send, or click to send now'
    : mic.state === 'error'
      ? `${mic.notice ?? 'The mic had a problem.'} Click to try again.`
      : 'Talk (Ctrl/⌘+Shift+1)'
  return (
    <button
      type="button"
      onClick={onMic}
      title={title}
      aria-pressed={listening}
      className={cx(
        ROUND,
        'relative w-9',
        listening ? 'bg-rose-500 text-white' : mic.state === 'error' ? 'bg-white/[0.07] text-rose-300' : 'bg-white/[0.07] hover:bg-white/[0.12]'
      )}
    >
      {listening && (
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-rose-300"
          animate={{ scale: 1 + Math.min(1, mic.level * 2.2) * 0.35, opacity: 0.4 + mic.level }}
          transition={{ duration: 0.12 }}
        />
      )}
      <MicIcon size={16} />
    </button>
  )
}

function Switch({ label, icon, on, onChange, title }: { label: string; icon?: React.ReactNode; on: boolean; onChange: (on: boolean) => void; title: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={title}
      className="flex h-9 items-center gap-2 rounded-full bg-white/[0.07] px-3 text-[13px] font-medium hover:bg-white/[0.12]"
    >
      {icon}
      {label}
      <span className={cx('relative h-[18px] w-8 rounded-full transition-colors', on ? 'bg-amber-400' : 'bg-zinc-600')}>
        <span className={cx('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left]', on ? 'left-[16px]' : 'left-[2px]')} />
      </span>
    </button>
  )
}

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [since])
  return since ? Math.max(0, Math.round((now - since) / 1000)) : 0
}

function ThinkingChip({ since, animate }: { since: number | null; animate: boolean }) {
  const seconds = useElapsed(since)
  return (
    <span className="flex h-9 items-center gap-1.5 rounded-full bg-white/[0.05] px-3 text-[12.5px] text-zinc-300">
      <Dots />
      {animate ? 'Tracing' : 'Thinking'}
      <span className="tabular-nums text-zinc-500">{seconds}s</span>
    </span>
  )
}

function Dots() {
  return (
    <span className="flex gap-1">
      <span className="busy-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
      <span className="busy-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
      <span className="busy-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
    </span>
  )
}

// ---------- the card ----------

function Card({ view, mic, listening, reading }: { view: IslandView; mic: VoiceInput; listening: boolean; reading: ReadAloud }) {
  const thinking = view.phase === 'thinking'
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [view.messages.length, thinking, listening, mic.heard, mic.interim])

  const recap = view.trace ? view.recapAt : -1
  const watchAgain = recap >= 0 && !thinking

  return (
    <div
      className={cx('w-[560px] rounded-2xl p-4', DARK)}
      onMouseEnter={() => islandApi.holdCard(true)}
      onMouseLeave={() => islandApi.holdCard(reading.speaking)}
    >
      <div className="mb-2 flex items-center gap-2">
        {view.snippet ? (
          <SnippetPreview text={view.snippet} />
        ) : (
          <div className="min-w-0 flex-1 truncate text-[12px] text-zinc-500">
            {view.messages.length ? 'About your screen' : 'Highlight code and click Ask, or ask here about your screen'}
          </div>
        )}
        {reading.speaking && (
          <button
            type="button"
            onClick={reading.stop}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-sky-400/15 px-2.5 text-[12px] text-sky-200 hover:bg-sky-400/25"
            title="Stop reading aloud"
          >
            <SpeakerIcon size={13} /> Reading aloud · Stop
          </button>
        )}
        <button
          type="button"
          onClick={() => islandApi.setExpanded(false)}
          title="Close"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <div ref={scroller} className="max-h-[50vh] space-y-2.5 overflow-y-auto pr-1 text-[14.5px] leading-relaxed">
        {view.messages.map((m, i) =>
          m.role === 'clueless' ? (
            <div key={i} className="selectable">
              {i === recap && (
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">What the animation showed</div>
              )}
              <Markdown text={m.text} />
              {i === recap && watchAgain && (
                <button
                  type="button"
                  onClick={() => islandApi.replay()}
                  className="mt-2 flex h-8 items-center gap-1.5 rounded-full bg-amber-400 pl-2.5 pr-3.5 text-[13px] font-semibold text-zinc-950 hover:bg-amber-300"
                >
                  <PlayIcon size={12} /> Watch again
                </button>
              )}
            </div>
          ) : (
            <div key={i} className="flex justify-end">
              <div className="selectable max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 px-3 py-1.5">{m.text}</div>
            </div>
          )
        )}
        {view.error && <div className="rounded-lg bg-rose-500/15 px-3 py-2 text-[13.5px] text-rose-200">{view.error}</div>}
        {listening && <LiveWords mic={mic} />}
        {!listening && mic.state === 'error' && mic.notice && (
          <div className="rounded-lg bg-white/[0.05] px-3 py-2 text-[13px] text-zinc-300">{mic.notice}</div>
        )}
        {thinking && <Thinking since={view.busySince} animate={view.animate} />}
      </div>

      <Composer disabled={thinking || listening} />
    </div>
  )
}

function SnippetPreview({ text }: { text: string }) {
  const lines = text.trim().split('\n')
  return (
    <div className="min-w-0 flex-1 truncate rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-400">
      {lines[0].trim()}
      {lines.length > 1 && <span className="text-zinc-500"> · {lines.length} lines</span>}
    </div>
  )
}

/** What the mic hears, as you speak: settled words, then the part that may still change. */
function LiveWords({ mic }: { mic: VoiceInput }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-rose-400/30 bg-rose-500/10 px-3 py-1.5">
        {mic.heard || mic.interim ? (
          <>
            <span>{mic.heard}</span>
            {mic.interim && <span className="text-zinc-400"> {mic.interim}</span>}
          </>
        ) : (
          <span className="flex items-center gap-2 text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
            {mic.state === 'starting' ? 'Connecting…' : 'Listening…'}
          </span>
        )}
      </div>
    </div>
  )
}

function Thinking({ since, animate }: { since: number | null; animate: boolean }) {
  const seconds = useElapsed(since)
  return (
    <div className="flex items-center gap-2 text-[13.5px] text-zinc-400">
      <Dots />
      {animate ? 'Tracing it step by step…' : 'Thinking…'}
      <span className="tabular-nums text-zinc-500">{seconds}s</span>
    </div>
  )
}

function Composer({ disabled }: { disabled: boolean }) {
  const [text, setText] = useState('')
  const send = (): void => {
    if (!text.trim() || disabled) return
    islandApi.askText(text.trim())
    setText('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      send()
    }
    if (e.key === 'Escape') islandApi.setExpanded(false)
  }
  return (
    <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] py-1 pl-3 pr-1 focus-within:border-amber-400/70">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about your highlight or your screen…"
        className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-500"
      />
      <button
        type="button"
        onClick={send}
        disabled={!text.trim() || disabled}
        title="Send"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-zinc-950 disabled:opacity-40"
      >
        <SendIcon size={14} />
      </button>
    </div>
  )
}

// ---------- reading text answers aloud ----------

interface ReadAloud {
  speaking: boolean
  stop(): void
}

/** Voice on: each new text answer is read aloud (animations read their own lines). While it's
 *  being read, the card doesn't close by itself. */
function useReadAloud(view: IslandView): ReadAloud {
  const [speaking, setSpeaking] = useState(false)
  const count = view.messages.length
  const seen = useRef(count)
  const last = view.messages[count - 1]

  useEffect(() => {
    const grew = count > seen.current
    seen.current = count
    if (!grew || !view.voice || view.phase !== 'answer' || last?.role !== 'clueless') return
    setSpeaking(true)
    islandApi.holdCard(true)
    speech.speak(toSpeech(last.text), () => {
      setSpeaking(false)
      islandApi.holdCard(false)
    })
  }, [count, view.voice, view.phase, last])

  // Something else took over (the animation, a new question, Voice turned off): stop reading.
  useEffect(() => {
    if (!speaking) return
    if (!view.voice || view.phase === 'thinking' || view.phase === 'playing' || !view.expanded) {
      speech.stop()
      setSpeaking(false)
      islandApi.holdCard(false)
    }
  }, [speaking, view.voice, view.phase, view.expanded])

  useEffect(
    () =>
      speech.subscribe((s) => {
        if (s.state === 'idle') setSpeaking(false)
      }),
    []
  )

  return {
    speaking,
    stop: () => {
      speech.stop()
      setSpeaking(false)
      islandApi.holdCard(false)
    }
  }
}

/** The "Ask" button window that appears next to the cursor after a highlight. */
export function AskButton({ onAsk = () => islandApi.ask() }: { onAsk?: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the highlight in the browser mock
      onClick={onAsk}
      className="flex h-9 items-center gap-1.5 rounded-full bg-amber-400 pl-2 pr-4 text-[14px] font-semibold text-zinc-950 shadow-[0_6px_20px_rgba(0,0,0,0.35)] ring-1 ring-black/10 hover:bg-amber-300"
    >
      <Logo size={17} /> Ask
    </button>
  )
}
