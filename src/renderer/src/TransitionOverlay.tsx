import type { Alert } from '../../shared/alert'

/**
 * The whole content of the overlay window: one phase change, and one way out.
 *
 * There is no timer here and no auto-close — the point of the overlay is that a
 * notification is swallowed by Do Not Disturb and by fullscreen apps, so this
 * stays on screen until the user says they have seen it (see AGENTS.md).
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
    <button
      type="button"
      className="rounded bg-neutral-700 px-6 py-2 text-lg"
      onClick={() => void window.klokki.dismissAlert()}
    >
      Dismiss
    </button>
  </section>
)
