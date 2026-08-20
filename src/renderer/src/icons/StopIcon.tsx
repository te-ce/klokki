import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const StopIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Svg>
)
