import { MarkIcon } from './icons'

export const TimerIdle = () => (
  <div className="flex flex-col items-start gap-3 py-6">
    <MarkIcon className="text-edge size-8" />
    <p className="text-ink-dim">Nothing running.</p>
  </div>
)
