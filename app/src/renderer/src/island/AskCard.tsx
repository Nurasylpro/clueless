// The answer to an Ask, in the panel: what was highlighted, the latest question and answer,
// follow-ups, and while the animation plays on the code, its controls.
import { useEffect, useState, type KeyboardEvent } from 'react'
import type { IslandView } from '../../../shared/contracts'
import { BackIcon, CloseIcon, NextIcon, PauseIcon, PlayIcon, RetryIcon, SendIcon, SpeakerIcon, SpeakerOffIcon, StopIcon } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { Button, cx, IconButton } from '../components/ui'
import { speech } from '../voice/speaker'
import { useVoiceMode, voiceMode } from '../voice/voiceMode'
import { islandApi } from './api'

export function AskCard({ view, onReadAloud }: { view: IslandView; onReadAloud?: (markdown: string) => void }) {
  const last = view.messages[view.messages.length - 1]
  const answer = last?.role === 'clueless' ? last.text : null
  // The student's latest follow-up: still waiting for its answer, or the one the answer is for.
  const asked = [...view.messages].reverse().find((m) => m.role === 'student')
  const showAsked = asked && (view.phase === 'thinking' || view.messages[view.messages.length - 2] === asked)

  return (
    <div className="space-y-2 px-3 py-2.5" data-ask-card>
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-claude-500/15 px-2 py-px text-[10.5px] font-semibold uppercase tracking-wide text-claude-700 dark:text-claude-400">
          Ask
        </span>
        {view.snippet && <SnippetPreview text={view.snippet} />}
        <VoiceToggle />
        <IconButton title="Close" onClick={() => islandApi.close()} className="h-6 w-6 shrink-0">
          <CloseIcon size={13} />
        </IconButton>
      </div>

      {showAsked && (
        <div className="flex items-start gap-2 text-[12.5px]">
          <span className="mt-px shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">You</span>
          <span className="selectable line-clamp-2 text-zinc-700 dark:text-zinc-300">{asked.text}</span>
        </div>
      )}
      {view.phase === 'thinking' && <Thinking since={view.busySince} animate={view.animate} />}
      {view.phase === 'answer' && answer && (
        <div className="group relative rounded-xl border border-zinc-900/10 bg-white/70 py-2 pl-3 pr-7 text-[13px] text-zinc-800 dark:border-white/10 dark:bg-black/35 dark:text-zinc-100">
          {onReadAloud && (
            <IconButton
              title="Read aloud"
              onClick={() => onReadAloud(answer)}
              className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <SpeakerIcon size={13} />
            </IconButton>
          )}
          <div className="selectable">
            <Markdown text={answer} />
          </div>
        </div>
      )}
      {view.error && <div className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">{view.error}</div>}
      {view.notice && <div className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{view.notice}</div>}
      {view.phase === 'answer' && view.trace && <Playback view={view} />}
      {view.phase === 'answer' && !view.error && <FollowUp />}
    </div>
  )
}

/** Voice on: the answer and every step of the animation are read aloud, and the animation waits for them. */
function VoiceToggle() {
  const on = useVoiceMode()
  return (
    <IconButton
      title={on ? 'Voice is on: each step is read aloud. Click to turn it off' : 'Read the answer and each step aloud'}
      aria-pressed={on}
      onClick={() => {
        voiceMode.set(!on)
        if (on) speech.stop()
      }}
      className={cx('ml-auto h-6 w-6 shrink-0', on && 'text-claude-600 dark:text-claude-400')}
    >
      {on ? <SpeakerIcon size={13} /> : <SpeakerOffIcon size={13} />}
    </IconButton>
  )
}

function SnippetPreview({ text }: { text: string }) {
  const lines = text.trim().split('\n')
  return (
    <div className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-zinc-500 dark:text-zinc-400">
      {lines[0].trim()}
      {lines.length > 1 && <span className="text-zinc-400 dark:text-zinc-500"> · {lines.length} lines</span>}
    </div>
  )
}

function Thinking({ since, animate }: { since: number | null; animate: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const seconds = since ? Math.max(0, Math.round((now - since) / 1000)) : 0
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="flex gap-0.5">
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
        <span className="busy-dot h-1.5 w-1.5 rounded-full bg-claude-500" />
      </span>
      {animate ? 'Getting your code ready to run…' : 'Reading what you highlighted…'}
      <span className="tabular-nums text-zinc-400">{seconds}s</span>
    </div>
  )
}

/** Play / pause / step through the animation on the code, replay it, or take it off the screen. */
function Playback({ view }: { view: IslandView }) {
  const total = view.trace?.steps.length ?? 0
  const p = view.playback
  if (!p) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="chip" onClick={() => islandApi.replay()} disabled={!view.animate} title={view.animate ? 'Play it on your code again' : 'Turn Animate on to play it'}>
          <RetryIcon size={12} /> Replay on my code
        </Button>
        <span className="text-[11px] text-zinc-400">{total} steps</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <IconButton title="Step back" onClick={() => islandApi.step(-1)} disabled={p.index <= 0} className="h-7 w-7 disabled:opacity-30">
        <BackIcon size={13} />
      </IconButton>
      {p.playing ? (
        <IconButton title="Pause" onClick={() => islandApi.pause()} className="h-7 w-7">
          <PauseIcon size={13} />
        </IconButton>
      ) : (
        <IconButton title={p.index >= total - 1 ? 'Play again' : 'Play'} onClick={() => islandApi.play()} className="h-7 w-7">
          <PlayIcon size={13} />
        </IconButton>
      )}
      <IconButton title="Step forward" onClick={() => islandApi.step(+1)} disabled={p.index >= total - 1} className="h-7 w-7 disabled:opacity-30">
        <NextIcon size={13} />
      </IconButton>
      <div className="mx-1.5 h-1 flex-1 overflow-hidden rounded-full bg-zinc-900/10 dark:bg-white/10">
        <div className="h-full rounded-full bg-claude-500 transition-[width] duration-500" style={{ width: `${total ? (Math.max(0, p.index + 1) / total) * 100 : 0}%` }} />
      </div>
      <span className={cx('w-12 text-right text-[11px] tabular-nums text-zinc-500')}>
        {Math.max(0, p.index + 1)} / {total}
      </span>
      <IconButton title="Take it off the screen" onClick={() => islandApi.stop()} className="h-7 w-7">
        <StopIcon size={12} />
      </IconButton>
    </div>
  )
}

function FollowUp() {
  const [text, setText] = useState('')
  const send = (): void => {
    if (!text.trim()) return
    islandApi.followUp(text.trim())
    setText('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }
  return (
    <div className="no-drag flex items-center gap-1.5 rounded-lg border border-zinc-900/10 bg-white/70 py-0.5 pl-2.5 pr-0.5 focus-within:border-claude-500 dark:border-white/15 dark:bg-black/30">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask a follow-up about this…"
        className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
      />
      <IconButton title="Send" onClick={send} disabled={!text.trim()} className="h-7 w-7 bg-claude-500 text-white hover:bg-claude-400 disabled:opacity-40">
        <SendIcon size={13} />
      </IconButton>
    </div>
  )
}
