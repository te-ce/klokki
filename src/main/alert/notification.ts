import type { Alert } from '../../shared/alert'

/**
 * A button on the native notification.
 *
 * The label is decided here, with the rest of the wording; the effect is the
 * same call the overlay's control makes, handed in by whoever knows what this
 * alert is about. The Electron adapter (surface.ts) only turns the pair into a
 * platform button, so it holds no decision of either kind.
 */
export type NotificationAction = {
  readonly label: string
  readonly run: () => void
}

export type NotificationText = {
  readonly title: string
  readonly body: string
  /**
   * macOS shows the first of these inline and the rest behind its "additional
   * actions" affordance, so the one that matters comes first.
   */
  readonly actions: readonly NotificationAction[]
}

/**
 * What the native notification says. Separate from showing it so the wording is
 * checkable without a display — the overlay's copy lives in the renderer and is
 * tested the same way (src/renderer/src/TransitionOverlay.tsx).
 */
export const notificationFor = (
  alert: Alert,
  /**
   * Stops the run this alert is announcing. Offered on the notification for the
   * same reason it is offered on the overlay: the boundary is where the user
   * decides they are done. A run with no phase following has already ended, so
   * there is nothing left to stop and the button is left off.
   */
  stop?: () => void,
): NotificationText => {
  const next = alert.nextLabel ?? 'Timer finished'
  return {
    title: `${alert.completedLabel} finished`,
    body: alert.nextLabel === null ? next : `${next} starting now`,
    actions:
      stop && alert.nextLabel !== null
        ? [{ label: 'Stop Timer', run: stop }]
        : [],
  }
}
