import { describe, expect, it } from 'vitest'
import { enumerateDateKeys, toIsoDayBounds, toIsoRangeBounds } from './date'

describe('date utils', () => {
  it('builds day bounds in ISO format', () => {
    const { startIso, endIso } = toIsoDayBounds('2026-02-21')
    expect(startIso < endIso).toBe(true)
    expect(startIso.endsWith('Z')).toBe(true)
    expect(endIso.endsWith('Z')).toBe(true)
  })

  it('builds range bounds from input dates', () => {
    const { startIso, endIso } = toIsoRangeBounds('2026-02-01', '2026-02-05')
    expect(startIso < endIso).toBe(true)
  })

  it('enumerates each day in range', () => {
    const keys = enumerateDateKeys('2026-02-01', '2026-02-03')
    expect(keys).toEqual(['2026-02-01', '2026-02-02', '2026-02-03'])
  })
})

