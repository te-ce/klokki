/** The notification half of an alert, as much of it as voiding one needs. */
type Withdrawable = {
  readonly withdraw: () => void
}

/** The overlay half — `OverlayControl`, and the fakes that stand in for it. */
type Closable = {
  readonly close: () => void
}

/**
 * Voiding an alert: the overlay window closes and the notification is taken
 * back, because an alert is one thing shown in two places rather than two
 * things (see `createAlertPresenter`). Whatever raised both halves is answered
 * by hiding both halves.
 *
 * This is what a stop reaches. An alert outliving the thing that raised it is
 * worse than no alert at all: it names a boundary that no longer exists, its
 * Snooze can only be declined, and its affirmative would answer a run that is
 * gone — and the copy sitting in Notification Center is the half that survives
 * the window being gone.
 *
 * The withdraw is guarded for the same reason the notify is: the half the
 * platform can swallow must not be able to take the other one down with it.
 */
export const voidAlert =
  (notification: Withdrawable, overlay: Closable): (() => void) =>
  () => {
    overlay.close()
    try {
      notification.withdraw()
    } catch {
      /* empty */
    }
  }
