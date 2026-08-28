import { Notification } from 'electron'
import type { NotificationText } from './notification'

/**
 * The notification half of one alert surface: shows it, and takes it back.
 *
 * `withdraw` is why this holds state at all — a notification can only be
 * dismissed through the handle that raised it, so the handle is kept until the
 * next one supersedes it or something withdraws it. That is the whole reason
 * this is an adapter and not a function: the decision of *when* an alert is
 * void lives above the ports (see alert/void.ts), and one notifier per surface
 * is what keeps a stopped run from taking Sports' notification with it.
 */
export type Notifier = {
  readonly notify: (text: NotificationText) => void
  readonly withdraw: () => void
}

/**
 * A native notification, actions and all — the one place Electron's
 * `Notification` is constructed, called once per alert surface because each
 * surface withdraws its own.
 *
 * The buttons come from the text: their labels were decided with the wording
 * and their effects by whoever raised the alert, so nothing is decided here.
 * macOS is the only platform Klokki ships on and it shows the first action
 * inline; a platform with no action support simply shows the notification.
 */
export const createNotifier = (): Notifier => {
  let showing: Notification | null = null

  return {
    notify: (text) => {
      if (!Notification.isSupported()) return

      const notification = new Notification({
        title: text.title,
        body: text.body,
        actions: text.actions.map((action) => ({
          type: 'button' as const,
          text: action.label,
        })),
      })
      notification.on('action', ({ actionIndex }) => {
        text.actions[actionIndex]?.run()
      })
      // A notification the user has already dealt with is not ours to withdraw,
      // and the handle would otherwise outlive what it points at.
      notification.on('close', () => {
        if (showing === notification) showing = null
      })
      showing = notification
      notification.show()
    },
    withdraw: () => {
      showing?.close()
      showing = null
    },
  }
}
