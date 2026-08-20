import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const TimerIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V9" />
    <path d="M9 2h6" />
  </Svg>
)
