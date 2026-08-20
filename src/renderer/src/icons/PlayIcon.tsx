import type { IconProps } from './icon-props'

/** Filled, because it reads as a button at 12px where a stroked one reads as noise. */
export const PlayIcon = ({ className = 'size-3' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M6 4l14 8-14 8z" />
  </svg>
)
