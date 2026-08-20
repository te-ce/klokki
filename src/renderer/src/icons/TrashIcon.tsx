import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const TrashIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" />
  </Svg>
)
