import type { Alert } from '../../shared/alert'
import { MS_PER_MINUTE } from '../../shared/preset'
import { SNOOZE_MS } from '../../shared/timer'

/**
 * The whole content of the overlay window: one phase change, and two ways out.
 *
 * There is no timer here and no auto-close — the point of the overlay is that a
 * notification is swallowed by Do Not Disturb and by fullscreen apps, so this
 * stays on screen until the user says they have seen it (see AGENTS.md). Snooze
 * is the other way out, because an alert that can only be acknowledged gets
 * turned off: it defers the boundary instead of skipping the phase.
 *
 * With no phase following, there is no boundary to defer — the timer is simply
 * over — so the snooze is not offered at all rather than offered and ignored.
 */
export const TransitionOverlay = ({ alert }: { alert: Alert }) => (
  <section
    data-testid="transition-overlay"
    className="flex h-screen flex-col items-center justify-center gap-6 bg-neutral-950/95 p-10 text-center"
  >
    <p className="text-sm tracking-widest text-neutral-400 uppercase">
      {alert.completedLabel} finished
    </p>
    <p className="text-5xl font-semibold">
      {alert.nextLabel ?? 'Timer finished'}
    </p>
    <div className="flex items-center gap-3">
      {alert.nextLabel !== null && (
        <button
          type="button"
          className="rounded bg-neutral-800 px-6 py-2 text-lg"
          onClick={() => void window.klokki.snoozeAlert()}
        >
          {`Snooze ${SNOOZE_MS / MS_PER_MINUTE} minutes`}
        </button>
      )}
      <button
        type="button"
        className="rounded bg-neutral-700 px-6 py-2 text-lg"
        onClick={() => void window.klokki.dismissAlert()}
      >
        Dismiss
      </button>
    </div>
  </section>
)
