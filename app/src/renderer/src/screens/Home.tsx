// Header, setup banners and the empty "stuck on something?" screen.
import { useRef, useState, type ButtonHTMLAttributes } from 'react'
import type { AppStatus, StuckState } from '../../../shared/contracts'
import { api } from '../api'
import {
  BulbIcon,
  CloseIcon,
  ExpandIcon,
  FileIcon,
  GearIcon,
  LayersIcon,
  Logo,
  MinusIcon,
  MonitorIcon,
  PowerIcon,
  ScanIcon,
  SelectAreaIcon,
  SendIcon,
  SparkleIcon
} from '../components/icons'
import { MicButton } from '../components/MicButton'
import { Button, cx, hotkeyLabel, IconButton } from '../components/ui'
import type { VoiceConversation } from '../voice/useVoiceConversation'

export type Glass = 'glass' | 'clear' | 'solid'
export const GLASS_ALPHA: Record<Glass, number> = { glass: 0.62, clear: 0.38, solid: 0.96 }
const NEXT_GLASS: Record<Glass, Glass> = { glass: 'clear', clear: 'solid', solid: 'glass' }

export function Header({
  compact,
  dueCards,
  totalCards,
  stuck,
  glass,
  onGlass,
  onToggleCompact,
  onOpenReview
}: {
  compact: boolean
  dueCards: number
  totalCards: number
  stuck: StuckState | null
  glass: Glass
  onGlass: (g: Glass) => void
  onToggleCompact: () => void
  onOpenReview: () => void
}) {
  const [menu, setMenu] = useState(false)
  return (
    <header className="drag relative flex h-11 shrink-0 items-center gap-2 border-b border-zinc-900/10 pl-3 pr-2 dark:border-white/10">
      <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-gradient-to-b from-claude-400 to-claude-500 text-white shadow-sm">
        <Logo size={14} />
      </div>
      <span className="text-[14.5px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Clueless</span>
      {stuck && stuck.level > 0 && (
        <span
          className={cx('glow-dot h-2.5 w-2.5 rounded-full bg-claude-500', stuck.level === 2 && 'bg-claude-600')}
          title={stuck.reason ?? 'Stuck?'}
        />
      )}
      <div className="ml-auto flex items-center gap-1">
        {compact && (
          <Button variant="primary" className="mr-1 h-7 px-2.5 text-xs" onClick={() => api.ask('screen')}>
            <ScanIcon size={13} /> Ask
          </Button>
        )}
        <button
          type="button"
          onClick={onOpenReview}
          title={`Flashcards: ${dueCards} due of ${totalCards}. Open your flashcards and gap map`}
          className={cx(
            'no-drag mr-1 h-6 rounded-full border px-2 text-[11px] font-medium tabular-nums transition-colors',
            dueCards > 0
              ? 'border-claude-400/60 text-claude-600 hover:bg-claude-500/10 dark:text-claude-300'
              : 'border-zinc-900/15 text-zinc-600 hover:bg-zinc-900/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10'
          )}
        >
          {dueCards}/{totalCards}
        </button>
        <HeaderButton title={`Transparency: ${glass} (click to change)`} onClick={() => onGlass(NEXT_GLASS[glass])}>
          <LayersIcon size={14} className={glass === 'solid' ? '' : glass === 'glass' ? 'opacity-80' : 'opacity-50'} />
        </HeaderButton>
        <HeaderButton title={compact ? 'Expand' : 'Shrink to a bar'} onClick={onToggleCompact}>
          {compact ? <ExpandIcon size={13} /> : <MinusIcon size={15} />}
        </HeaderButton>
        <HeaderButton title="Hide (Esc). The hotkey brings it back." onClick={() => api.hide()}>
          <CloseIcon size={15} />
        </HeaderButton>
        <HeaderButton title="Settings" onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <GearIcon size={14} />
        </HeaderButton>
      </div>
      {menu && (
        <>
          <div className="no-drag fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="no-drag absolute right-2 top-[40px] z-20 w-40 rounded-lg border border-zinc-900/10 bg-white p-1 text-[12px] shadow-lg dark:border-white/10 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => onGlass(NEXT_GLASS[glass])}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10"
            >
              Transparency <span className="capitalize text-zinc-400">{glass}</span>
            </button>
            <button
              type="button"
              onClick={() => api.quit()}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <PowerIcon size={14} /> Quit Clueless
            </button>
          </div>
        </>
      )}
    </header>
  )
}

/**
 * Compact mode: just a pill. The logo reads the screen; the mic talks to Clueless right from here
 * (with no problem yet, what you say becomes the problem). Drag it anywhere.
 */
export function CompactBar({
  conv,
  busy,
  onExpand
}: {
  conv: VoiceConversation
  busy: boolean // the tutor is working
  onExpand: () => void
}) {
  return (
    <div className="drag flex h-[52px] items-center gap-2.5 pl-2.5 pr-2">
      <button
        type="button"
        onClick={() => api.ask('screen')}
        disabled={busy}
        title="Read my screen (Ctrl/⌘+Shift+Space)"
        className="no-drag flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-b from-claude-400 to-claude-500 text-white shadow-sm transition hover:brightness-110 active:brightness-95 disabled:opacity-60"
      >
        <Logo size={16} />
      </button>
      <span className="text-[15px] font-medium tracking-tight text-zinc-900 dark:text-zinc-50">Clueless</span>
      <span className="ml-auto" />
      <MicButton conv={conv} disabled={busy} round />
      <HeaderButton title="Expand" onClick={onExpand}>
        <MinusIcon size={16} />
      </HeaderButton>
      <HeaderButton title="Hide (Esc). The hotkey brings it back." onClick={() => api.hide()}>
        <CloseIcon size={16} />
      </HeaderButton>
    </div>
  )
}

function HeaderButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <IconButton
      className={cx('h-7 w-7 rounded-md text-zinc-500 dark:text-zinc-300 dark:hover:text-white', className)}
      {...rest}
    />
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
  const input = useRef<HTMLTextAreaElement>(null)
  const askKey = hotkeyLabel(status?.hotkeys.ask ?? 'CommandOrControl+Shift+Space', status?.platform)
  const areaKey = hotkeyLabel(status?.hotkeys.area ?? 'CommandOrControl+Shift+2', status?.platform)
  const start = (): void => {
    if (text.trim()) api.askText(text.trim())
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center px-8 pb-4 pt-6 text-center">
        <SparkleIcon size={22} strokeWidth={1.6} className="text-claude-500 dark:text-claude-400" />
        <h1 className="mt-3 text-[18px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Stuck on something?</h1>
        <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">Let&apos;s work through it together.</p>
        <button
          type="button"
          onClick={() => api.ask('screen')}
          title={`Read my screen (${askKey})`}
          className="no-drag mt-5 flex h-10 w-full items-center justify-center gap-2.5 rounded-[10px] bg-gradient-to-b from-claude-400 to-claude-500 text-[13px] font-semibold text-white shadow-[0_6px_20px_-6px_rgb(217_119_87/0.55)] transition hover:brightness-105 active:brightness-95"
        >
          <MonitorIcon size={16} strokeWidth={1.8} /> Read my screen
        </button>
        <div className="mt-4 flex w-full items-center gap-3 text-[11.5px] text-zinc-400 dark:text-zinc-500">
          <span className="h-px flex-1 bg-zinc-900/10 dark:bg-white/10" />
          or
          <span className="h-px flex-1 bg-zinc-900/10 dark:bg-white/10" />
        </div>
        <div className="mt-2 grid w-full grid-cols-2">
          <button
            type="button"
            onClick={() => api.ask('area')}
            title={`Select just the problem (${areaKey})`}
            className="no-drag flex items-center justify-center gap-2 rounded-lg py-2 text-[12.5px] text-zinc-600 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <SelectAreaIcon size={17} strokeWidth={1.6} /> Select area
          </button>
          <button
            type="button"
            onClick={() => input.current?.focus()}
            title="Type or paste the problem below"
            className="no-drag flex items-center justify-center gap-2 rounded-lg py-2 text-[12.5px] text-zinc-600 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <FileIcon size={17} strokeWidth={1.6} /> Paste a problem
          </button>
        </div>
      </div>
      <div className="px-2 pb-2">
        <div className="flex items-center gap-2.5 rounded-xl border border-zinc-900/10 bg-white/50 py-1.5 pl-3 pr-1.5 transition-colors focus-within:border-claude-400/70 dark:border-white/15 dark:bg-white/[0.03]">
          <BulbIcon size={16} strokeWidth={1.6} className="shrink-0 text-zinc-500 dark:text-zinc-300" />
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                start()
              }
            }}
            rows={1}
            placeholder="Paste your question, code, or problem..."
            className="no-drag max-h-32 min-h-[1.25rem] flex-1 resize-none bg-transparent py-0.5 text-[12.5px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50 dark:placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={start}
            disabled={!text.trim()}
            title="Start (Enter)"
            className="no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900/5 text-zinc-500 transition-colors enabled:hover:bg-claude-500 enabled:hover:text-white disabled:cursor-default dark:bg-white/10 dark:text-zinc-300"
          >
            <SendIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
