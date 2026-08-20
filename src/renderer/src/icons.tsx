/**
 * Every glyph the settings window uses, drawn rather than installed.
 *
 * Stroke-based on a 24-unit grid, inheriting `currentColor`, so one icon works at
 * rail size and at button size and recolours with the text beside it. Same reason
 * the app's own icons are drawn by code (see scripts/icon/): an icon font or an
 * SVG asset is a binary this repo would carry and never diff.
 */

type IconProps = {
  // Spelled with `| undefined` because the project runs
  // `exactOptionalPropertyTypes`: one icon forwards these to the next.
  readonly className?: string | undefined
  /** Hairlines vanish on a small filled button; a heavier one is offered there. */
  readonly strokeWidth?: number | undefined
}

const Svg = ({
  className = 'size-4',
  strokeWidth = 1.6,
  children,
}: IconProps & { readonly children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
)

/** The app's mark: the clock ring with two hands, at a quarter past twelve. */
export const MarkIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12V7" />
    <path d="M12 12h4" />
  </Svg>
)

export const TimerIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V9" />
    <path d="M9 2h6" />
  </Svg>
)

export const PresetsIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h10" />
  </Svg>
)

export const StatsIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M5 19V11" />
    <path d="M12 19V5" />
    <path d="M19 19v-6" />
  </Svg>
)

export const GeneralIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </Svg>
)

export const SkipIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M5 5l9 7-9 7z" />
    <path d="M18 5v14" />
  </Svg>
)

export const StopIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Svg>
)

export const PlusIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const ChevronRightIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
)

export const ChevronUpIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M6 14l6-6 6 6" />
  </Svg>
)

export const ChevronDownIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M6 10l6 6 6-6" />
  </Svg>
)

export const CloseIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const TrashIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" />
  </Svg>
)

/** Filled, because it reads as a button at 12px where a stroked one reads as noise. */
export const PlayIcon = ({ className = 'size-3' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M6 4l14 8-14 8z" />
  </svg>
)
