import { Svg } from './Svg'
import type { IconProps } from './icon-props'

/** A dumbbell — the one glyph in the rail for logging physical activity. */
export const SportsIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M4 9v6" />
    <path d="M2 10v4" />
    <path d="M20 9v6" />
    <path d="M22 10v4" />
    <path d="M7 12h10" />
    <path d="M7 8v8" />
    <path d="M17 8v8" />
  </Svg>
)
