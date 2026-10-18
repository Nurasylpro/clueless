/// <reference types="vite/client" />
import type { CluelessApi, IslandApi } from '../../shared/contracts'

declare global {
  interface Window {
    clueless?: CluelessApi
    island?: IslandApi
  }
}
