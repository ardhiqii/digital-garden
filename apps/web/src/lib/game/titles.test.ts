import { describe, expect, it } from 'vitest'
import { TITLES, resolveTitle } from './titles'

describe('resolveTitle', () => {
  it('starts at the first title for zero XP', () => {
    const resolved = resolveTitle(0)
    expect(resolved.title.id).toBe('seedling')
    expect(resolved.title.tier).toBe(1)
    expect(resolved.xpIntoTier).toBe(0)
  })

  it('treats negative and non-finite XP as zero rather than throwing', () => {
    expect(resolveTitle(-500).title.id).toBe('seedling')
    expect(resolveTitle(Number.NaN).title.id).toBe('seedling')
    expect(resolveTitle(Number.POSITIVE_INFINITY).title.id).toBe('seedling')
  })

  it('awards the HIGHER title exactly at each threshold (boundary)', () => {
    for (const title of TITLES) {
      expect(resolveTitle(title.threshold).title.id).toBe(title.id)
    }
  })

  it('stays on the lower title one XP below a threshold', () => {
    for (let i = 1; i < TITLES.length; i += 1) {
      const below = resolveTitle(TITLES[i].threshold - 1)
      expect(below.title.id).toBe(TITLES[i - 1].id)
    }
  })

  it('never goes down as XP rises (monotonic)', () => {
    let previousTier = 0
    for (let xp = 0; xp <= 120_000; xp += 250) {
      const tier = resolveTitle(xp).title.tier
      expect(tier).toBeGreaterThanOrEqual(previousTier)
      previousTier = tier
    }
  })

  it('reports progress and the next tier between thresholds', () => {
    // Midway between gardener (1500) and botanist (5000).
    const resolved = resolveTitle(3250)
    expect(resolved.title.id).toBe('gardener')
    expect(resolved.nextTitle?.id).toBe('botanist')
    expect(resolved.xpForNextTier).toBe(3500)
    expect(resolved.xpIntoTier).toBe(1750)
    expect(resolved.progress).toBeCloseTo(0.5, 5)
  })

  it('caps progress at 1 on the top tier with no next title', () => {
    const resolved = resolveTitle(999_999)
    expect(resolved.title.id).toBe('elderwood')
    expect(resolved.nextTitle).toBeNull()
    expect(resolved.xpForNextTier).toBeNull()
    expect(resolved.progress).toBe(1)
  })

  it('has strictly increasing thresholds starting at zero', () => {
    expect(TITLES[0].threshold).toBe(0)
    for (let i = 1; i < TITLES.length; i += 1) {
      expect(TITLES[i].threshold).toBeGreaterThan(TITLES[i - 1].threshold)
      expect(TITLES[i].tier).toBe(TITLES[i - 1].tier + 1)
    }
  })

  it('pins tier 3 to the mossling stage threshold so the ladders agree', () => {
    // types.ts STAGES: mossling starts at 1500.
    const gardener = TITLES.find((title) => title.id === 'gardener')
    expect(gardener?.threshold).toBe(1500)
  })
})
