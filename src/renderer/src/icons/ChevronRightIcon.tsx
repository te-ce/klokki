import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const ChevronRightIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
)
