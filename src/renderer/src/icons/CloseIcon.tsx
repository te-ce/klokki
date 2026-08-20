import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const CloseIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)
