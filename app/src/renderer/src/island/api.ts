// In Electron the preload script provides `window.island`. In a plain browser (`npm run ui`) the
// same island runs on a mock: the real state machine with a fake Claude (see mock.ts).
import type { IslandApi } from '../../../shared/contracts'
import { createIslandMock } from './mock'

export const isIslandMock = !window.island
export const mock = isIslandMock ? createIslandMock() : null
export const islandApi: IslandApi = window.island ?? mock!
