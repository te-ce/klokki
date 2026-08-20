import { describe, expect, it, vi } from 'vitest'
import { createLoginItem, type LoginItemHost } from './login-item'

/** Stands in for Electron's app, which owns the real macOS login item. */
const createHost = (openAtLogin = false): LoginItemHost => {
  let settings = { openAtLogin }
  return {
    getLoginItemSettings: () => settings,
    setLoginItemSettings: vi.fn((next) => {
      settings = { openAtLogin: next.openAtLogin }
    }),
  }
}

describe('reading the toggle', () => {
  it('is off when macOS has no login item for the app', () => {
    expect(createLoginItem(createHost()).isEnabled()).toBe(false)
  })

  it('is on when one exists, even though the app never stored that itself', () => {
    expect(createLoginItem(createHost(true)).isEnabled()).toBe(true)
  })

  it('re-reads the OS each time, so a change made outside the app shows up', () => {
    const host = createHost()
    const item = createLoginItem(host)
    expect(item.isEnabled()).toBe(false)

    host.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })

    expect(item.isEnabled()).toBe(true)
  })
})

describe('flipping the toggle', () => {
  it('registers the login item and reports the state the OS now has', () => {
    const host = createHost()

    expect(createLoginItem(host).setEnabled(true)).toBe(true)
    expect(host.getLoginItemSettings().openAtLogin).toBe(true)
  })

  it('opens hidden: a menubar app must not show a window at login', () => {
    const host = createHost()

    createLoginItem(host).setEnabled(true)

    expect(host.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      openAsHidden: true,
    })
  })

  it('removes the login item again', () => {
    const host = createHost(true)

    expect(createLoginItem(host).setEnabled(false)).toBe(false)
    expect(host.getLoginItemSettings().openAtLogin).toBe(false)
  })
})
