/**
 * Shared shape for every glyph in this directory.
 */

export type IconProps = {
  // Spelled with `| undefined` because the project runs
  // `exactOptionalPropertyTypes`: one icon forwards these to the next.
  readonly className?: string | undefined
  /** Hairlines vanish on a small filled button; a heavier one is offered there. */
  readonly strokeWidth?: number | undefined
}
