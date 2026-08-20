import { useEffect, useState } from 'react'

/**
 * The General settings. The launch-at-login toggle mirrors the real macOS login
 * item: it is read from the OS on mount and re-read from the OS after every
 * write, so removing the item in System Settings — or a write that quietly fails
 * — cannot leave this checkbox lying (see src/main/login-item.ts).
 */
export const GeneralSection = () => {
  const [launchAtLogin, setLaunchAtLogin] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.klokki.getLaunchAtLogin().then((enabled) => {
      if (!cancelled) setLaunchAtLogin(enabled)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">General</h2>
      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          aria-label="Launch at login"
          checked={launchAtLogin}
          onChange={(event) => {
            void window.klokki
              .setLaunchAtLogin(event.target.checked)
              .then(setLaunchAtLogin)
          }}
        />
        Launch at login
      </label>
    </section>
  )
}
