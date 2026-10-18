// The play button under a tutor turn that has a visual. The student reads the text first, then
// chooses to play it: nothing animates on its own. No visual on the turn = no button.
// Code-mode turns play over the student's code; everything else plays in the widened panel.
// The drawings themselves live in ../visuals (SceneView).
import type { TurnView } from '../../../shared/contracts'
import { playsOnCode, usePlayback } from '../visuals/playback'
import { CloseIcon, PlayIcon, RetryIcon } from './icons'
import { Button } from './ui'

export function VisualSlot({ itemId, turn }: { itemId: string; turn: TurnView }) {
  const { playing, play, replay, stop } = usePlayback()
  const visual = turn.visual
  if (!visual || visual.frames.length === 0) return null
  const active = playing?.itemId === itemId
  const onCode = playsOnCode(turn.animation)
  const steps = `${visual.frames.length} step${visual.frames.length === 1 ? '' : 's'}`

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-claude-400/60 bg-claude-50/50 px-2 py-1.5 text-xs dark:border-claude-600/25 dark:bg-claude-600/5">
      {active ? (
        <>
          <span className="flex h-2 w-2 shrink-0 rounded-full bg-claude-500 glow-dot" />
          <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">
            {onCode ? 'Playing on your code' : 'Playing on the left'}
          </span>
          <Button variant="chip" onClick={replay} title="Play it again from the start">
            <RetryIcon size={12} /> Replay
          </Button>
          <Button variant="chip" onClick={stop} title="Close the animation">
            <CloseIcon size={12} /> Close
          </Button>
        </>
      ) : (
        <>
          <Button variant="primary" onClick={() => play(itemId, turn)} className="h-7 gap-1 px-2 text-[11.5px]">
            <PlayIcon size={11} /> {onCode ? 'Play on my code' : 'Play animation'}
          </Button>
          <span className="min-w-0 flex-1 truncate text-zinc-500 dark:text-zinc-400" title={visual.caption}>
            {visual.caption ? `${visual.caption} · ` : ''}
            {steps}
          </span>
        </>
      )}
    </div>
  )
}
