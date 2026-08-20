import { Svg } from './Svg'
import type { IconProps } from './icon-props'

/** The app's mark: the clock ring with two hands, at a quarter past twelve. */
export const MarkIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12V7" />
    <path d="M12 12h4" />
  </Svg>
)
