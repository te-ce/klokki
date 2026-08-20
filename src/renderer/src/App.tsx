import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/ipc'
import { GeneralSection } from './GeneralSection'
import { PresetsSection } from './PresetsSection'
import { Rail, type Section } from './Rail'
import { RemindersSection } from './RemindersSection'
import { StatsSection } from './StatsSection'
import { TimerPanel } from './TimerPanel'

const PANES: Record<Section, () => React.ReactNode> = {
  timer: TimerPanel,
  presets: PresetsSection,
  reminders: RemindersSection,
  stats: StatsSection,
  general: GeneralSection,
}

/**
 * The settings window: a rail on the left, one pane on the right.
 *
 * Only the open pane is mounted, which is deliberate — a pane that is not on
 * screen must not be subscribed to anything. Every pane reads and subscribes on
 * mount (see AGENTS.md), so switching back to one shows what is true now rather
 * than what was true when the window opened.
 */
export const App = () => {
  const [section, setSection] = useState<Section>('timer')
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

  const Pane = PANES[section]

  return (
    <div className="bg-ground text-ink flex h-screen text-[13px]">
      <Rail section={section} onSelect={setSection} info={info} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* The title bar is hidden inset, so the pane owns the space under it. */}
        <div className="drag-region h-13 shrink-0" />
        <div className="flex flex-1 flex-col px-6 pb-5">
          <Pane />
        </div>
      </main>
    </div>
  )
}
