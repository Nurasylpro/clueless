// Explain mode ("Animate the problem" / "Animate the question"): the panel widens and the
// animation plays in this pane, next to the conversation. Plays once, then freezes on the last frame.
import { CloseIcon, PlayIcon, RetryIcon } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { Button, cx, IconButton } from '../components/ui'
import type { Playing } from './playback'
import { SceneView } from './SceneView'
import { useFramePlayer } from './useFramePlayer'

export function AnimationPane({ playing, onReplay, onClose }: { playing: Playing; onReplay: () => void; onClose: () => void }) {
  const { visual } = playing
  const player = useFramePlayer(visual.frames.length, playing.nonce)
  const scene = visual.frames[player.index]

  return (
    <section className="flex w-[420px] shrink-0 flex-col border-r border-zinc-900/10 dark:border-white/10">
      <div className="flex items-center gap-2 border-b border-zinc-900/10 px-3 py-2 dark:border-white/10">
        <PlayIcon size={13} className="text-amber-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Animation</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">{visual.caption}</span>
        <IconButton title="Close the animation" onClick={onClose}>
          <CloseIcon size={15} />
        </IconButton>
      </div>
      <div className="border-b border-zinc-900/10 px-3 py-2 text-[13px] text-zinc-800 dark:border-white/10 dark:text-zinc-100">
        <Markdown text={playing.message} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">{scene && <SceneView scene={scene} />}</div>
      <div className="flex items-center gap-2 border-t border-zinc-900/10 px-3 py-2 dark:border-white/10">
        <FrameDots count={visual.frames.length} index={player.index} onJump={player.jump} />
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {player.index + 1} / {visual.frames.length}
        </span>
        <Button variant="chip" className="ml-auto" onClick={onReplay} title="Play it again from the start">
          <RetryIcon size={12} /> Replay
        </Button>
      </div>
    </section>
  )
}

export function FrameDots({ count, index, onJump }: { count: number; index: number; onJump?: (i: number) => void }) {
  if (count < 2) return null
  return (
    <span className="flex flex-wrap items-center gap-1">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={!onJump}
          onClick={() => onJump?.(i)}
          title={`Step ${i + 1}`}
          className={cx(
            'no-drag h-1.5 rounded-full transition-all',
            i === index ? 'w-4 bg-amber-400' : i < index ? 'w-1.5 bg-amber-400/50' : 'w-1.5 bg-zinc-300 dark:bg-zinc-600',
            onJump && 'cursor-pointer'
          )}
        />
      ))}
    </span>
  )
}
