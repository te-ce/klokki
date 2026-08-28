/**
 * Every glyph the settings window uses, drawn rather than installed.
 *
 * Stroke-based on a 24-unit grid, inheriting `currentColor`, so one icon works at
 * rail size and at button size and recolours with the text beside it. Same reason
 * the app's own icons are drawn by code (see scripts/icon/): an icon font or an
 * SVG asset is a binary this repo would carry and never diff.
 */

export { MarkIcon } from './MarkIcon'
export { TimerIcon } from './TimerIcon'
export { PresetsIcon } from './PresetsIcon'
export { StatsIcon } from './StatsIcon'
export { GeneralIcon } from './GeneralIcon'
export { SportsIcon } from './SportsIcon'
export { SkipIcon } from './SkipIcon'
export { StopIcon } from './StopIcon'
export { PlusIcon } from './PlusIcon'
export { ChevronRightIcon } from './ChevronRightIcon'
export { ChevronUpIcon } from './ChevronUpIcon'
export { ChevronDownIcon } from './ChevronDownIcon'
export { CloseIcon } from './CloseIcon'
export { TrashIcon } from './TrashIcon'
export { PlayIcon } from './PlayIcon'
