import { Svg } from './Svg'
import type { IconProps } from './icon-props'

export const SkipIcon = ({ className, strokeWidth }: IconProps) => (
  <Svg className={className} strokeWidth={strokeWidth}>
    <path d="M5 5l9 7-9 7z" />
    <path d="M18 5v14" />
  </Svg>
)
