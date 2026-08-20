import { describe, expect, it } from 'vitest'
import { formatRemaining } from './format'

describe('formatRemaining', () => {
  it.each([
    [0, '00:00'],
    [-5_000, '00:00'],
    [1, '00:01'],
    [25 * 60_000, '25:00'],
    [271_000, '04:31'],
    [60 * 60_000, '1:00:00'],
    [4_329_000, '1:12:09'],
  ])('renders %ims as %s', (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected)
  })
})
