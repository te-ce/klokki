import { Notification } from 'electron'
import type { NotificationText } from './notification'

/**
 * A native notification, actions and all — the one place Electron's
 * `Notification` is constructed, shared by the three alert surfaces because
 * there is nothing platform-specific to say about it three times.
 *
 * The buttons come from the text: their labels were decided with the wording
 * and their effects by whoever raised the alert, so nothing is decided here.
 * macOS is the only platform Klokki ships on and it shows the first action
 * inline; a platform with no action support simply shows the notification.
 */
export const showNotification = (text: NotificationText): void => {
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
  notification.show()
}
