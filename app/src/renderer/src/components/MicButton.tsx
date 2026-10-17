// The mic button in the answer box. Click to talk; it stops on its own when you pause, or click
// again to stop now. States: idle, connecting, listening (ring follows your voice), finishing,
// waiting for the tutor, error.
import type { VoiceInput } from '../voice/useVoiceInput'
import { MicIcon } from './icons'
import { cx, IconButton } from './ui'

export function MicButton({
  voice,
  processing,
  disabled
}: {
  voice: VoiceInput
  processing: boolean // the transcript was sent and the tutor is thinking
  disabled?: boolean
}) {
  const { state, level } = voice
  const active = state === 'starting' || state === 'listening'
  const title =
    state === 'starting'
      ? 'Connecting…'
      : state === 'listening'
        ? 'Listening. Pause to send, or click to stop'
        : state === 'finishing'
          ? 'Finishing…'
          : processing
            ? 'Sent. Waiting for Clueless…'
            : state === 'error'
              ? `${voice.notice ?? 'Voice error'} Click to try again.`
              : 'Talk instead of typing (Ctrl/⌘+Shift+1)'

  return (
    <IconButton
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={(disabled && !active) || state === 'finishing'}
      onClick={() => (active ? voice.stop() : void voice.start())}
      className={cx(
        'disabled:cursor-not-allowed disabled:opacity-40',
        state === 'listening' && 'bg-rose-500 text-white hover:bg-rose-500 hover:text-white dark:text-white dark:hover:bg-rose-500',
        state === 'starting' && 'bg-rose-500/20 text-rose-600 dark:text-rose-300',
        state === 'error' && 'text-rose-500 dark:text-rose-400',
        (state === 'finishing' || processing) && 'text-claude-500 dark:text-claude-400'
      )}
    >
      {state === 'listening' && (
        // Activity ring: grows with the loudness of your voice.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-rose-400/70 transition-transform duration-75"
          style={{ transform: `scale(${1 + level * 0.45})` }}
        />
      )}
      {state === 'starting' && <span aria-hidden="true" className="mic-pulse pointer-events-none absolute inset-0 rounded-md" />}
      {state === 'finishing' || processing ? (
        <span className="flex gap-0.5" aria-hidden="true">
          <span className="busy-dot h-1 w-1 rounded-full bg-current" />
          <span className="busy-dot h-1 w-1 rounded-full bg-current" />
          <span className="busy-dot h-1 w-1 rounded-full bg-current" />
        </span>
      ) : (
        <MicIcon size={16} />
      )}
    </IconButton>
  )
}

/** Live transcript strip above the answer box while recording, or a short notice afterwards. */
export function VoiceStrip({ voice, onDismiss }: { voice: VoiceInput; onDismiss: () => void }) {
  const { state, heard, interim, notice } = voice
  const recording = state === 'starting' || state === 'listening' || state === 'finishing'
  if (!recording && !notice) return null

  if (!recording) {
    return (
      <div
        className={cx(
          'mb-1.5 flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs',
          state === 'error'
            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200'
            : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
        )}
      >
        <span className="min-w-0 flex-1">{notice}</span>
        <button type="button" onClick={onDismiss} className="no-drag shrink-0 opacity-60 hover:opacity-100" title="Dismiss">
          ✕
        </button>
      </div>
    )
  }

  const label = state === 'starting' ? 'Connecting…' : state === 'finishing' ? 'Finishing…' : 'Listening…'
  return (
    <div className="mb-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1.5 text-[13px] dark:border-rose-900/60 dark:bg-rose-950/30">
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-rose-600 dark:text-rose-300">
        <span className={cx('h-1.5 w-1.5 rounded-full bg-rose-500', state === 'listening' && 'animate-pulse')} />
        {label}
        <span className="ml-auto flex gap-2 normal-case tracking-normal">
          {state === 'listening' && (
            <button type="button" onClick={voice.stop} className="no-drag hover:underline" title="Send what you said now">
              Done
            </button>
          )}
          <button type="button" onClick={voice.cancel} className="no-drag hover:underline" title="Throw this away">
            Cancel
          </button>
        </span>
      </div>
      <div className="selectable min-h-5 text-zinc-800 dark:text-zinc-100">
        {heard}
        {heard && interim ? ' ' : ''}
        <span className="text-zinc-400 italic dark:text-zinc-500">{interim}</span>
        {!heard && !interim && <span className="text-zinc-400 dark:text-zinc-500">Say your answer or question…</span>}
      </div>
    </div>
  )
}
