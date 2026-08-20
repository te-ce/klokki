import { describe, expect, it } from 'vitest'
import { validatePreset, type Preset } from './preset'

const valid: Preset = {
  id: 'stretch',
  name: 'Stretch',
  loop: false,
  phases: [{ label: 'Move', minutes: 2, notify: true }],
}

describe('a preset the user can save', () => {
  it('reports no problems', () => {
    expect(validatePreset(valid)).toEqual([])
  })
})

describe('a preset that could never make progress', () => {
  it('rejects an empty phase list', () => {
    expect(validatePreset({ ...valid, phases: [] })).toEqual([
      'A preset needs at least one phase.',
    ])
  })

  it('names the offending phase when one is zero minutes', () => {
    expect(
      validatePreset({
        ...valid,
        phases: [
          { label: 'Move', minutes: 2, notify: true },
          { label: 'Instant', minutes: 0, notify: false },
        ],
      }),
    ).toEqual(['Phase 2 needs to be longer than zero minutes.'])
  })

  it('rejects a negative phase', () => {
    expect(
      validatePreset({
        ...valid,
        phases: [{ label: 'Move', minutes: -1, notify: true }],
      }),
    ).toEqual(['Phase 1 needs to be longer than zero minutes.'])
  })
})

describe('a preset the user could not tell apart', () => {
  it('rejects a blank name', () => {
    expect(validatePreset({ ...valid, name: '   ' })).toEqual([
      'A preset needs a name.',
    ])
  })

  it('rejects a blank phase label', () => {
    expect(
      validatePreset({
        ...valid,
        phases: [{ label: '', minutes: 5, notify: true }],
      }),
    ).toEqual(['Phase 1 needs a label.'])
  })
})

describe('several problems at once', () => {
  it('reports all of them, so the form can list them', () => {
    expect(
      validatePreset({
        ...valid,
        name: '',
        phases: [{ label: '', minutes: 0, notify: true }],
      }),
    ).toEqual([
      'A preset needs a name.',
      'Phase 1 needs a label.',
      'Phase 1 needs to be longer than zero minutes.',
    ])
  })
})
