import type { KlokkiApi } from '../../shared/ipc'

declare global {
  interface Window {
    klokki: KlokkiApi
  }
}
