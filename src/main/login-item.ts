/**
 * The slice of Electron's `app` that owns the macOS login item. Narrowed to two
 * calls so the behaviour can be tested without an Electron instance.
 */
export type LoginItemHost = {
  readonly getLoginItemSettings: () => { readonly openAtLogin: boolean }
  readonly setLoginItemSettings: (settings: {
    readonly openAtLogin: boolean
    readonly openAsHidden: boolean
  }) => void
}

export type LoginItem = {
  readonly isEnabled: () => boolean
  readonly setEnabled: (enabled: boolean) => boolean
}

/**
 * Launch at login, read from the OS rather than remembered.
 *
 * There is no copy of this setting in presets.json on purpose: the user can
 * remove the login item in System Settings, and a value the app stored itself
 * would then leave the toggle lying. `setEnabled` reports what the OS has after
 * the write for the same reason.
 */
export const createLoginItem = (host: LoginItemHost): LoginItem => {
  const isEnabled = (): boolean => host.getLoginItemSettings().openAtLogin

  return {
    isEnabled,
    setEnabled: (enabled) => {
      // A menubar app opening a window at login would be an ambush.
      host.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
      return isEnabled()
    },
  }
}
