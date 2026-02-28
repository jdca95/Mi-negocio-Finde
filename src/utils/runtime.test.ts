import { describe, expect, it } from 'vitest'
import { buildFolio } from './runtime'

describe('runtime utils', () => {
  it('builds readable folios with prefix and location', () => {
    const folio = buildFolio('VTA', 'suc1', '2026-02-27T16:40:50.000Z')
    expect(folio.startsWith('VTA-SUC1-20260227')).toBe(true)
  })
})

