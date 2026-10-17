// In Electron, the preload script provides `window.clueless`. In a plain browser
// (`npm run ui`) we fall back to a mock that replays a Valid Sudoku session.
import type { CluelessApi } from '../../shared/contracts'
import { createMockApi } from './mock/mockApi'

export const isMock = !window.clueless
export const api: CluelessApi = window.clueless ?? createMockApi()
