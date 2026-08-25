import type { Alert } from '../../shared/alert'
import { MS_PER_MINUTE } from '../../shared/preset'
import { SNOOZE_MS } from '../../shared/timer'
import { SnoozeChoice } from './SnoozeChoice'

/**
 * The whole content of the overlay window: one phase change, and two ways out.
 *
 * There is no timer here and no auto-close — the point of the overlay is that a
 * notification is swallowed by Do Not Disturb and by fullscreen apps, so this
 * stays on screen until the user says they have seen it (see AGENTS.md). Snooze
 * is the other way out, because an alert that can only be acknowledged gets
 * turned off: it defers the boundary instead of skipping the phase.
 *
 * The run is holding at this boundary until one of the two is clicked, which is
 * why the acknowledgement is named after what it does — "Start Break", not
 * "Dismiss". A phase that began while the overlay sat unread would be a phase
 * the user never got.
 *
 * With no phase following, there is no boundary to defer — the timer is simply
 * over — so the snooze is not offered at all rather than offered and ignored.
 *
 * The snooze is `SnoozeChoice` with the one increment the main process offers
 * (`SNOOZE_MS`), so the footer is the footer of the other two overlays even
 * though only this one has a single amount to choose from.
 */
export const TransitionOverlay = ({ alert }: { alert: Alert }) => (
  <section
    data-testid="transition-overlay"
    className="bg-ground/95 flex h-screen flex-col gap-3.5 p-5"
  >
    <p className="text-ink-faint text-center text-[10px] tracking-[0.22em] uppercase">
      {alert.completedLabel} finished
    </p>
    <p className="text-center text-[26px] leading-none font-semibold tracking-[-0.02em]">
      {alert.nextLabel ?? 'Timer finished'}
    </p>
    <div className="mt-auto flex items-center justify-between gap-3">
      {alert.nextLabel !== null ? (
        <SnoozeChoice
          options={[SNOOZE_MS / MS_PER_MINUTE]}
          onSnooze={() => void window.klokki.snoozeAlert()}
        />
      ) : (
        <span />
      )}
      <button
        type="button"
        className="bg-ink text-ground h-9 rounded-lg px-5 font-medium"
        onClick={() => void window.klokki.dismissAlert()}
      >
        {alert.nextLabel === null ? 'Dismiss' : `Start ${alert.nextLabel}`}
      </button>
    </div>
  </section>
)
