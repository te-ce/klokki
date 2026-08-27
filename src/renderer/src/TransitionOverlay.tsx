import type { Alert } from '../../shared/alert'
import { TIMER_SNOOZE_MINUTES_OPTIONS } from '../../shared/timer'
import { OverlayStop } from './OverlayStop'
import { SnoozeChoice } from './SnoozeChoice'

/**
 * The whole content of the overlay window: one phase change, and three ways out.
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
 * The snooze is `SnoozeChoice` with the same fixed +5/+10/+15/+30 options the
 * reminder and Sports overlays offer (`TIMER_SNOOZE_MINUTES_OPTIONS`), and Stop
 * is `OverlayStop`, so the footer is the footer of the other two overlays.
 */
export const TransitionOverlay = ({ alert }: { alert: Alert }) => (
  <section
    data-testid="transition-overlay"
    className="bg-ground/95 flex h-screen flex-col gap-3.5 p-5"
  >
    {/* The one static row in the window — the natural place to grab it and
        drag, since nothing here is ever clickable. */}
    <p className="drag-region text-ink-faint text-center text-[10px] tracking-[0.22em] uppercase">
      {alert.completedLabel} finished
    </p>
    <p className="text-center text-[26px] leading-none font-semibold tracking-[-0.02em]">
      {alert.nextLabel ?? 'Timer finished'}
    </p>
    <div className="mt-auto flex items-center justify-between gap-3">
      {alert.nextLabel !== null ? (
        <div className="flex items-center gap-2">
          {/* Stopping ends the run the boundary belongs to, so there is nothing
              left to answer and the overlay closes with it. Offered only while a
              phase is still to come: a run that has finished is already over. */}
          <OverlayStop
            label="Stop timer"
            onStop={() => void window.klokki.stopFromAlert()}
          />
          <SnoozeChoice
            options={TIMER_SNOOZE_MINUTES_OPTIONS}
            onSnooze={(extraMs) => void window.klokki.snoozeAlert(extraMs)}
          />
        </div>
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
