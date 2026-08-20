import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const PlusIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
