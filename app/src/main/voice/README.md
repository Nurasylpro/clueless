# Voice (to build)

Everything else is wired up. Voice plugs in here and in `src/renderer/src/components/MicButton.tsx`.

**Goal (SPEC.md §5, F9):**
- **Press to talk:** recording stops on its own when you pause.
- **Think-aloud mode:** the student explains their plan out loud, and Clueless only speaks up if something's off.

## Plan

1. **UI (`MicButton.tsx`)**
   - Get the mic with `navigator.mediaDevices.getUserMedia({ audio: true })`.
   - Record it with `MediaRecorder` (`audio/webm;codecs=opus`, `timeslice` 250 ms).
   - Send each chunk to the main process with `ipcRenderer.send(IPC.voiceAudio, arrayBuffer)`. Expose this in `src/preload/index.ts` and add it to `CluelessApi` in `src/shared/contracts.ts`.
2. **Main (`src/main/voice/deepgram.ts`)**
   - Open a WebSocket to `wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true&endpointing=400&utterance_end_ms=1200`.
   - Authenticate with the header `Authorization: Token ${process.env.DEEPGRAM_API_KEY}` (the `ws` package supports headers). The key stays in the main process.
   - Forward the audio chunks. Send `{"type":"KeepAlive"}` every 5 s while idle, and `{"type":"CloseStream"}` to stop.
   - On each `Results` message, send `IPC.voiceTranscript` `{ text, final: is_final }` to the overlay.
   - On `speech_final` or `UtteranceEnd`, the utterance is done.
3. **UI again:** `onTranscript(text, final)` puts the text in the answer box. When it's final and the student has paused, send it.
4. **macOS:**
   - Call `systemPreferences.askForMediaAccess('microphone')` before the first recording.
   - The packaged app already has `NSMicrophoneUsageDescription` (`electron-builder.yml`).
5. **Hotkey:** register `CommandOrControl+Shift+1` in `src/main/index.ts` (next to the others) to toggle recording.

`AppStatus.hasDeepgramKey` already tells the UI whether a key is set.
