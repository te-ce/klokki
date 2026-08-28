import { alertFromRoute } from '../../shared/alert'
import { sportsAlertFromRoute } from '../../shared/sports-alert'
import { App } from './App'
import { SportsOverlay } from './SportsOverlay'
import { TransitionOverlay } from './TransitionOverlay'

/**
 * One bundle serves every window, so which view this is comes from the URL the
 * main process opened it with. An overlay carries its alert in that URL, so it
 * has everything it needs before its first render.
 */
export const Root = () => {
  const alert = alertFromRoute(window.location.hash)
  if (alert) return <TransitionOverlay alert={alert} />

  const sportsAlert = sportsAlertFromRoute(window.location.hash)
  if (sportsAlert) return <SportsOverlay alert={sportsAlert} />

  return <App />
}
