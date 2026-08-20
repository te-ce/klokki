import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const ChevronUpIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M6 14l6-6 6 6" />
  </Svg>
)
