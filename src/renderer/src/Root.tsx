import { alertFromRoute } from '../../shared/alert'
import { reminderAlertFromRoute } from '../../shared/reminder-alert'
import { App } from './App'
import { ReminderOverlay } from './ReminderOverlay'
import { TransitionOverlay } from './TransitionOverlay'

/**
 * One bundle serves every window, so which view this is comes from the URL the
 * main process opened it with. An overlay carries its alert in that URL, so it
 * has everything it needs before its first render.
 */
export const Root = () => {
  const alert = alertFromRoute(window.location.hash)
  if (alert) return <TransitionOverlay alert={alert} />

  const reminderAlert = reminderAlertFromRoute(window.location.hash)
  if (reminderAlert) return <ReminderOverlay alert={reminderAlert} />

  return <App />
}
