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
    <section className="flex flex-1 flex-col gap-4">
      <h2 className="text-ink-faint text-[11px] tracking-[0.08em] uppercase">
        General
      </h2>

      <label className="bg-panel border-line flex items-center gap-3 rounded-[9px] border p-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Launch at login</span>
          <span className="text-ink-faint text-[11px]">
            Read from macOS every time this window opens, never remembered here.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Launch at login"
          checked={launchAtLogin}
          onChange={(event) => {
            void window.klokki
              .setLaunchAtLogin(event.target.checked)
              .then(setLaunchAtLogin)
          }}
          className="accent-work ml-auto size-4 shrink-0"
        />
      </label>
    </section>
  )
}
