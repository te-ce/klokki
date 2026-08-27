/**
 * How big an overlay window is, in the one place both sides can read it.
 *
 * An overlay is sized to the alert it is about to show: the Sports overlay
 * asks about every activity at once, so its content grows with the activity
 * count, and a window fixed at one height either clipped it behind a
 * scrollbar or left the other two overlays half empty. The count is known
 * before the window opens, so the size is decided in the main process rather
 * than measured after paint — which keeps it a pure function with a test,
 * and keeps the window from resizing under the user a frame after it appears.
 *
 * The numbers are the overlay layout read off in pixels (`p-5`, `gap-3.5`, a
 * 32px row, a 36px footer). A change to that layout is a change here, which
 * is why the parts are named rather than folded into one constant.
 */

const PADDING = 40
const GAP = 14
const TITLE = 26
const EYEBROW = 14
const ROW = 32
const ROW_GAP = 6
const FOOTER = 36

/**
 * Wide enough for the footer all three overlays share, which is three controls
 * now rather than two: the snooze strip, Stop, and the affirmative. At 420 the
 * three of them ran past the window and wrapped, and a footer that wraps is a
 * height nothing above the renderer can predict — the same failure a button per
 * snooze increment caused (see `SnoozeChoice`).
 */
export const OVERLAY_WIDTH = 480

/**
 * The most of the screen an overlay may take. An alert is meant to be
 * impossible to miss, not to become the screen: past this the rows scroll
 * inside the window (`SportsOverlay`) rather than the window growing past the
 * display it opened on.
 */
const MAX_WORK_AREA_FRACTION = 0.8

/** A title, `rows` input rows, and the footer. */
const overlayHeight = (rows: number): number =>
  PADDING +
  TITLE +
  GAP +
  (rows === 0 ? 0 : ROW * rows + ROW_GAP * (rows - 1) + GAP) +
  FOOTER

/** The phase overlay: an eyebrow above the title, and no input at all. */
export const transitionOverlayHeight = (): number =>
  overlayHeight(0) + EYEBROW + GAP

/** The reminder overlay: one row when the step carries a unit, none otherwise. */
export const reminderOverlayHeight = (hasUnit: boolean): number =>
  overlayHeight(hasUnit ? 1 : 0)

/**
 * The Sports overlay: one row per activity, clamped to a share of the work
 * area. Enough activities would otherwise ask for a window taller than the
 * display, and a window taller than its display is one whose footer — the only
 * way out of the alert — cannot be clicked.
 */
export const sportsOverlayHeight = (
  activities: number,
  workAreaHeight: number,
): number =>
  Math.min(
    overlayHeight(activities),
    Math.round(workAreaHeight * MAX_WORK_AREA_FRACTION),
  )
