// ┌──────────────────────────────────────────────────────────────────────────────┐
// │ VOICE: owned by the voice teammate.                                          │
// │                                                                              │
// │ Plan (see SPEC.md §5 F9 and src/main/voice/README.md):                       │
// │ - Mic -> MediaRecorder (webm/opus) chunks -> IPC.voiceAudio -> main process  │
// │   streams them to Deepgram (DEEPGRAM_API_KEY stays in main).                 │
// │ - Main sends IPC.voiceTranscript { text, final } back; call `onTranscript`   │
// │   to put the text in the composer (final + paused = send it).                │
// │ - Think-aloud mode: send finished sentences as student messages.            │
// └──────────────────────────────────────────────────────────────────────────────┘
import { MicIcon } from './icons'
import { IconButton } from './ui'

export function MicButton(_props: { onTranscript: (text: string, final: boolean) => void; disabled?: boolean }) {
  return (
    <IconButton disabled title="Voice input is coming soon" className="cursor-not-allowed opacity-40 hover:bg-transparent">
      <MicIcon size={16} />
    </IconButton>
  )
}
