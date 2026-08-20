/**
 * The single contract between main and renderer.
 *
 * The renderer is sandboxed and has no Node access (see AGENTS.md): everything it
 * knows about the app arrives through this interface, implemented in src/preload
 * and served by src/main.
 */

export const IPC = {
  getAppInfo: 'klokki:get-app-info',
} as const

export type AppInfo = {
  version: string
  electron: string
}

export interface KlokkiApi {
  getAppInfo(): Promise<AppInfo>
}
