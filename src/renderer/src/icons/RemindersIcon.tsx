import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const RemindersIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M6 8a6 6 0 0 1 12 0c0 4 2 5 2 6H4c0-1 2-2 2-6Z" />
    <path d="M10 18a2 2 0 0 0 4 0" />
  </Svg>
)
