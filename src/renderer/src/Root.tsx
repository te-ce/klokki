import { alertFromRoute } from '../../shared/alert'
import { App } from './App'
import { TransitionOverlay } from './TransitionOverlay'

/**
 * One bundle serves both windows, so which view this is comes from the URL the
 * main process opened it with. An overlay carries its alert in that URL, so it
 * has everything it needs before its first render.
 */
export const Root = () => {
  const alert = alertFromRoute(window.location.hash)
  return alert ? <TransitionOverlay alert={alert} /> : <App />
}
