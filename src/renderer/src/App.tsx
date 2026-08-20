import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/ipc'
import { TimerPanel } from './TimerPanel'

export const App = () => {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.klokki.getAppInfo().then((next) => {
      if (!cancelled) setInfo(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Klokki</h1>
      <TimerPanel />
      {info ? (
        <p className="mt-auto text-sm text-neutral-500">
          v{info.version} · Electron {info.electron}
        </p>
      ) : null}
    </main>
  )
}
