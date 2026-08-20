import type { AppInfo } from '../../shared/ipc'
import {
  GeneralIcon,
  MarkIcon,
  PresetsIcon,
  StatsIcon,
  TimerIcon,
} from './icons'

export type Section = 'timer' | 'presets' | 'stats' | 'general'

const SECTIONS = [
  { id: 'timer', label: 'Timer', Icon: TimerIcon },
  { id: 'presets', label: 'Presets', Icon: PresetsIcon },
  { id: 'stats', label: 'Stats', Icon: StatsIcon },
  { id: 'general', label: 'General', Icon: GeneralIcon },
] as const satisfies readonly { id: Section; label: string; Icon: unknown }[]

type RailProps = {
  readonly section: Section
  readonly onSelect: (section: Section) => void
  readonly info: AppInfo | null
}

/**
 * The window's one navigation: four destinations, always visible, one pane at a
 * time.
 *
 * Which pane is open is the only piece of state the renderer owns outright — it
 * is not something the main process can be asked about, and nothing outside this
 * window can change it. Everything the panes show still comes over the bridge.
 */
export const Rail = ({ section, onSelect, info }: RailProps) => (
  <nav
    aria-label="Sections"
    className="bg-rail border-line flex w-38 shrink-0 flex-col border-r px-2 pb-3"
  >
    {/* Left of the traffic lights there is nothing to put, so this is the strip
        that drags the window. */}
    <div className="drag-region h-13" />

    <div className="flex items-center gap-2 px-2 pb-4">
      <MarkIcon className="text-work size-4.5" />
      <span className="text-[13px] font-semibold tracking-[0.01em]">
        Klokki
      </span>
    </div>

    <div className="flex flex-col gap-0.5">
      {SECTIONS.map(({ id, label, Icon }) => {
        const current = id === section
        return (
          <button
            key={id}
            type="button"
            aria-current={current ? 'page' : undefined}
            onClick={() => onSelect(id)}
            className={`flex h-7.5 items-center gap-2.5 rounded-md px-2 text-left ${
              current
                ? 'bg-line text-ink font-medium'
                : 'text-ink-dim hover:bg-panel hover:text-ink-soft'
            }`}
          >
            <Icon className="size-3.75" />
            <span>{label}</span>
          </button>
        )
      })}
    </div>

    {/* Two lines rather than one that wraps wherever it runs out of rail. */}
    {info ? (
      <p className="text-ink-hush mt-auto px-2 text-[11px] leading-tight tabular-nums">
        v{info.version}
        <br />
        Electron {info.electron}
      </p>
    ) : null}
  </nav>
)
