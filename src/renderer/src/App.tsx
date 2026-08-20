import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/ipc'

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
    <main className="flex min-h-screen flex-col gap-2 p-8">
      <h1 className="text-2xl font-semibold">Klokki</h1>
      <p className="text-neutral-400">
        Menubar interval timer. Presets and stats land here.
      </p>
      {info ? (
        <p className="mt-4 text-sm text-neutral-500">
          v{info.version} · Electron {info.electron}
        </p>
      ) : null}
    </main>
  )
}
