// The one speaker the whole UI uses, so two replies can never talk over each other:
// ElevenLabs when a key is set (through the main process), the computer's own voice otherwise.
import { api } from '../api'
import { createBrowserSpeech, createCloudSpeech, type SpeechService } from './speech'

export const speech: SpeechService = createCloudSpeech((req) => api.tts(req), createBrowserSpeech())
