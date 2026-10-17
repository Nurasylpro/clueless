/// <reference types="vite/client" />
import type { CluelessApi } from '../../shared/contracts'

declare global {
  interface Window {
    clueless?: CluelessApi
  }
}
