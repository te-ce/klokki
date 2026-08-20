import type { IconProps } from './icon-props'

/**
 * Stroke-based on a 24-unit grid, inheriting `currentColor`, so one icon works at
 * rail size and at button size and recolours with the text beside it.
 */
export const Svg = ({
  className = 'size-4',
  strokeWidth = 1.6,
  children,
}: IconProps & { readonly children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
)
