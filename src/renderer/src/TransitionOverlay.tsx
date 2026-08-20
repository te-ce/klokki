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
    className="bg-ground/95 flex h-screen flex-col items-center justify-center gap-5 p-10 text-center"
  >
    <p className="text-ink-faint text-[11px] tracking-[0.22em] uppercase">
      {alert.completedLabel} finished
    </p>
    <p className="text-[40px] leading-none font-semibold tracking-[-0.02em]">
      {alert.nextLabel ?? 'Timer finished'}
    </p>
    <div className="flex items-center gap-2.5">
      {alert.nextLabel !== null && (
        <button
          type="button"
          className="border-edge text-ink-soft hover:bg-panel h-9 rounded-lg border px-5"
          onClick={() => void window.klokki.snoozeAlert()}
        >
          {`Snooze ${SNOOZE_MS / MS_PER_MINUTE} minutes`}
        </button>
      )}
      <button
        type="button"
        className="bg-ink text-ground h-9 rounded-lg px-5 font-medium"
        onClick={() => void window.klokki.dismissAlert()}
      >
        Dismiss
      </button>
    </div>
  </section>
)
