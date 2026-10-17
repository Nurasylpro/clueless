// Header, setup banners and the empty "stuck on something?" screen.
import { useState } from 'react'
import type { AppStatus, StuckState } from '../../../shared/contracts'
import { api } from '../api'
import { CardsIcon, CloseIcon, CropIcon, DropIcon, ExpandIcon, Logo, PowerIcon, ScanIcon, ShrinkIcon } from '../components/icons'
import { Button, cx, hotkeyLabel, IconButton, Kbd } from '../components/ui'

export type Glass = 'glass' | 'clear' | 'solid'
export const GLASS_ALPHA: Record<Glass, number> = { glass: 0.62, clear: 0.38, solid: 0.96 }
const NEXT_GLASS: Record<Glass, Glass> = { glass: 'clear', clear: 'solid', solid: 'glass' }

export function Header({
  compact,
  dueCards,
  stuck,
  glass,
  onGlass,
  onToggleCompact,
  onOpenReview
}: {
  compact: boolean
  dueCards: number
  stuck: StuckState | null
  glass: Glass
  onGlass: (g: Glass) => void
  onToggleCompact: () => void
  onOpenReview: () => void
}) {
  return (
    <header className="drag flex h-12 shrink-0 items-center gap-2 border-b border-zinc-900/10 px-3 dark:border-white/10">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-zinc-950">
        <Logo size={17} />
      </div>
      <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Clueless</span>
      {stuck && stuck.level > 0 && (
        <span
          className={cx('glow-dot h-2.5 w-2.5 rounded-full bg-amber-400', stuck.level === 2 && 'bg-amber-500')}
          title={stuck.reason ?? 'Stuck?'}
        />
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {compact && (
          <Button variant="primary" className="mr-1 h-7 px-2.5 text-xs" onClick={() => api.ask('screen')}>
            <ScanIcon size={13} /> Ask
          </Button>
        )}
        <IconButton title={`Transparency: ${glass} (click to change)`} onClick={() => onGlass(NEXT_GLASS[glass])}>
          <DropIcon size={14} className={glass === 'solid' ? '' : glass === 'glass' ? 'opacity-70' : 'opacity-40'} />
        </IconButton>
        <IconButton title="Flashcards and gap map" onClick={onOpenReview}>
          <CardsIcon size={15} />
          {dueCards > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold text-zinc-950">
              {dueCards}
            </span>
          )}
        </IconButton>
        <IconButton title={compact ? 'Expand' : 'Shrink to a bar'} onClick={onToggleCompact}>
          {compact ? <ExpandIcon size={13} /> : <ShrinkIcon size={15} />}
        </IconButton>
        <IconButton title="Hide (Esc). The hotkey brings it back." onClick={() => api.hide()}>
          <CloseIcon size={15} />
        </IconButton>
        <IconButton title="Quit Clueless" onClick={() => api.quit()}>
          <PowerIcon size={14} />
        </IconButton>
      </div>
    </header>
  )
}

export function Banners({ status }: { status: AppStatus | null }) {
  if (!status) return null
  const screenBlocked = status.platform === 'darwin' && (status.screenAccess === 'denied' || status.screenAccess === 'restricted')
  return (
    <>
      {!status.hasAnthropicKey && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-semibold">Add your Claude API key.</span> Put{' '}
          <code className="font-mono">ANTHROPIC_API_KEY=…</code> in{' '}
          <code className="selectable break-all font-mono">{status.envFile}</code>, then press Ask. No restart needed.
        </div>
      )}
      {screenBlocked && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="flex-1">
            <span className="font-semibold">Clueless can't see your screen.</span> Allow Screen Recording, then restart Clueless.
          </span>
          <Button variant="chip" onClick={() => api.openScreenSettings()}>
            Open settings
          </Button>
        </div>
      )}
      {status.hotkeyErrors.length > 0 && (
        <div className="border-b border-zinc-900/10 bg-zinc-50/70 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-white/10 dark:bg-black/35 dark:text-zinc-400">
          Hotkey problem: {status.hotkeyErrors.join('; ')}. Use the buttons instead.
        </div>
      )}
    </>
  )
}

export function EmptyState({ status }: { status: AppStatus | null }) {
  const [text, setText] = useState('')
  const askKey = hotkeyLabel(status?.hotkeys.ask ?? 'CommandOrControl+Shift+Space', status?.platform)
  const areaKey = hotkeyLabel(status?.hotkeys.area ?? 'CommandOrControl+Shift+2', status?.platform)

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Stuck on something?</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Press <Kbd>{askKey}</Kbd> on any problem: code, math, physics. Clueless reads your screen and gives you
          clues, not answers.
        </p>
      </div>
      <div className="grid gap-2">
        <Button variant="primary" className="h-10" onClick={() => api.ask('screen')}>
          <ScanIcon size={16} /> Read my screen
        </Button>
        <Button className="h-10" onClick={() => api.ask('area')}>
          <CropIcon size={15} /> Select just the problem <Kbd>{areaKey}</Kbd>
        </Button>
      </div>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) api.askText(text.trim())
        }}
      >
        <label className="text-xs text-zinc-500 dark:text-zinc-400">…or paste the problem</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. A 5 kg block slides down a frictionless 30° ramp. Find its acceleration."
          className="no-drag resize-none rounded-xl border border-zinc-900/10 bg-white/70 px-3 py-2 text-[13.5px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-400 dark:border-white/15 dark:bg-black/35 dark:text-zinc-50"
        />
        <Button type="submit" disabled={!text.trim()}>
          Start with this problem
        </Button>
      </form>
      <p className="text-center text-[11px] text-zinc-400">
        Clueless shows up on screen share. Nothing to hide.
      </p>
    </div>
  )
}
