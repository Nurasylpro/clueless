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
    <header className="drag flex h-10 shrink-0 items-center gap-2 border-b border-zinc-900/10 px-2.5 dark:border-white/10">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-claude-500 text-white">
        <Logo size={15} />
      </div>
      <span className="text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Clueless</span>
      {stuck && stuck.level > 0 && (
        <span
          className={cx('glow-dot h-2.5 w-2.5 rounded-full bg-claude-500', stuck.level === 2 && 'bg-claude-600')}
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
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-claude-500 px-0.5 text-[9px] font-bold text-white">
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
      {!status.provider && (
        <div className="border-b border-claude-200 bg-claude-50/80 px-3 py-2 text-xs text-claude-900 dark:border-claude-600/30 dark:bg-claude-600/10 dark:text-claude-200">
          <span className="font-semibold">Connect Claude.</span> In{' '}
          <code className="selectable break-all font-mono">{status.envFile}</code> set{' '}
          <span className="font-semibold">Bedrock:</span> <code className="font-mono">AWS_REGION</code> and{' '}
          <code className="font-mono">AWS_BEARER_TOKEN_BEDROCK</code> (or <code className="font-mono">AWS_PROFILE</code> / access
          keys), <span className="font-semibold">or</span> <code className="font-mono">ANTHROPIC_API_KEY</code>. Then press Ask.
        </div>
      )}
      {screenBlocked && (
        <div className="flex items-center gap-2 border-b border-claude-200 bg-claude-50 px-3 py-2 text-xs text-claude-900 dark:border-claude-600/30 dark:bg-claude-600/10 dark:text-claude-200">
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
  const start = (): void => {
    if (text.trim()) api.askText(text.trim())
  }

  return (
    <div className="space-y-2.5 px-3 py-3">
      <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        Stuck? Press <Kbd>{askKey}</Kbd> on any problem. You get clues, not answers.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="primary" className="h-8 text-[12.5px]" onClick={() => api.ask('screen')}>
          <ScanIcon size={14} /> Read my screen
        </Button>
        <Button className="h-8 text-[12.5px]" onClick={() => api.ask('area')} title={`Select just the problem (${areaKey})`}>
          <CropIcon size={13} /> Select area
        </Button>
      </div>
      <div className="flex items-end gap-1.5 rounded-xl border border-zinc-900/10 bg-white/70 px-2 py-1 focus-within:border-claude-500 dark:border-white/15 dark:bg-black/35">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              start()
            }
          }}
          rows={1}
          placeholder="…or paste a problem and press Enter"
          className="no-drag min-h-[1.75rem] flex-1 resize-none bg-transparent py-0.5 text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50"
        />
      </div>
    </div>
  )
}
