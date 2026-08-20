import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const ChevronDownIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M6 10l6 6 6-6" />
  </Svg>
)
