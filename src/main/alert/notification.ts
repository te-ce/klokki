import type { Alert } from '../../shared/alert'

export type NotificationText = {
  readonly title: string
  readonly body: string
}

/**
 * What the native notification says. Separate from showing it so the wording is
 * checkable without a display — the overlay's copy lives in the renderer and is
 * tested the same way (src/renderer/src/TransitionOverlay.tsx).
 */
export const notificationFor = (alert: Alert): NotificationText => {
  const next = alert.nextLabel ?? 'Timer finished'
  return {
    title: `${alert.completedLabel} finished`,
    body: alert.nextLabel === null ? next : `${next} starting now`,
  }
}
