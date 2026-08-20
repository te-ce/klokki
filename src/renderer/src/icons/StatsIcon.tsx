import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const StatsIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M5 19V11" />
    <path d="M12 19V5" />
    <path d="M19 19v-6" />
  </Svg>
)
