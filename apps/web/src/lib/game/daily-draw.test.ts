/**
 * The daily draw is the path that makes a second companion reachable at all, so
 * the properties that matter are pinned here: exactly one per day, never two for
 * the same day, and a duplicate still converts to Essence.
 *
 * The failure this guards against is silent and slow: a draw that can be claimed
 * twice looks fine in the UI (the collection grows) and only shows up as an
 * economy that inflates whenever a user refreshes.
 */

import { describe, expect, it } from 'vitest'
import { createEncounterState, type EncounterState } from './encounters'
import {
  claimDailyDraw,
  dailyTriggerId,
  isDailyDrawDue,
  localDay,
} from './daily-draw'
import { PROTOTYPE_COMPANION_CATALOG } from './companion-catalog'
import { createGuestProfile, type GuestProfile } from './guest-profile'
import { applyEncounterDraws } from './product-state'
import { hatchEgg, pendingEggs } from './companion-eggs'

const catalog = PROTOTYPE_COMPANION_CATALOG
const NOW = '2026-10-07T12:00:00.000Z'

/** Build a Date from local parts, so the test does not depend on the runner's TZ. */
function at(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0)
}

describe('localDay', () => {
  it('is the local calendar day, not the UTC one', () => {
    // The regression: toISOString().slice(0,10) is UTC, so a user in UTC+7 would
    // see their draw reset at 7am instead of midnight.
    const evening = at(2026, 10, 7, 23)
    expect(localDay(evening)).toBe('2026-10-07')
    const justAfterMidnight = at(2026, 10, 8, 0)
    expect(localDay(justAfterMidnight)).toBe('2026-10-08')
  })

  it('zero-pads so day ordering is lexicographic', () => {
    expect(localDay(at(2026, 1, 5))).toBe('2026-01-05')
  })
})

describe('claiming', () => {
  it('awards a draw on an unclaimed day', () => {
    const r = claimDailyDraw(createEncounterState(), at(2026, 10, 7), catalog, [])
    expect(r.claimed).toBe(true)
    expect(r.newDraws).toHaveLength(1)
  })

  it('awards EXACTLY one draw, even from a meter that is already high', () => {
    // The persisted meter is always in [0, threshold), so progress = threshold
    // must yield floor((meter + threshold) / threshold) === 1, never 2.
    for (const meter of [0, 1, 50, 99, 99.9]) {
      const start: EncounterState = { ...createEncounterState(), meter }
      const r = claimDailyDraw(start, at(2026, 10, 7), catalog, [])
      expect(r.newDraws).toHaveLength(1)
    }
  })

  it('refuses a second claim on the same day', () => {
    const first = claimDailyDraw(createEncounterState(), at(2026, 10, 7, 9), catalog, [])
    const second = claimDailyDraw(first.state, at(2026, 10, 7, 23), catalog, [])
    expect(second.claimed).toBe(false)
    expect(second.newDraws).toHaveLength(0)
    // Nothing moved: the state comes back by identity.
    expect(second.state).toBe(first.state)
  })

  it('allows a new claim the next day', () => {
    const day1 = claimDailyDraw(createEncounterState(), at(2026, 10, 7), catalog, [])
    const day2 = claimDailyDraw(day1.state, at(2026, 10, 8), catalog, [])
    expect(day2.claimed).toBe(true)
    expect(day2.state.processedTriggerIds).toContain(dailyTriggerId('2026-10-08'))
  })

  it('records the day as processed', () => {
    const r = claimDailyDraw(createEncounterState(), at(2026, 10, 7), catalog, [])
    expect(r.state.processedTriggerIds).toContain('daily:2026-10-07')
  })

  it('is deterministic: the same day yields the same companion', () => {
    const a = claimDailyDraw(createEncounterState(), at(2026, 10, 7, 8), catalog, [])
    const b = claimDailyDraw(createEncounterState(), at(2026, 10, 7, 21), catalog, [])
    expect(a.newDraws[0]?.selectedCompanionId).toBe(b.newDraws[0]?.selectedCompanionId)
  })
})

describe('isDailyDrawDue', () => {
  it('is due before the first claim', () => {
    expect(isDailyDrawDue(createEncounterState(), at(2026, 10, 7))).toBe(true)
  })

  it('is not due once claimed, and is due again the next day', () => {
    const r = claimDailyDraw(createEncounterState(), at(2026, 10, 7), catalog, [])
    expect(isDailyDrawDue(r.state, at(2026, 10, 7))).toBe(false)
    expect(isDailyDrawDue(r.state, at(2026, 10, 8))).toBe(true)
  })
})

describe('duplicates convert to Essence', () => {
  it('marks a draw of an already-owned companion as a duplicate', () => {
    // Own every species the prototype catalog can produce, so the draw must be a
    // duplicate no matter which one the weighting picks.
    const owned = catalog.list().map((c) => c.id)
    const r = claimDailyDraw(createEncounterState(), at(2026, 10, 7), catalog, owned)
    expect(r.newDraws[0]?.isDuplicate).toBe(true)
    expect(r.newDraws[0]?.essenceAwarded).toBeGreaterThan(0)
  })

  it('banks that Essence against the family', () => {
    const owned = catalog.list().map((c) => c.id)
    const r = claimDailyDraw(createEncounterState(), at(2026, 10, 7), catalog, owned)
    const total = Object.values(r.state.essenceByFamily).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('treats the draw as new when nothing is owned yet', () => {
    const r = claimDailyDraw(createEncounterState(), at(2026, 10, 7), catalog, [])
    expect(r.newDraws[0]?.isDuplicate).toBe(false)
    expect(r.newDraws[0]?.essenceAwarded).toBe(0)
  })
})

describe('the draw is handed over as an egg', () => {
  it('a first claim lays an egg rather than adding to the collection', () => {
    // The draw used to land straight in the collection. It now becomes an egg the
    // user opens, so an unhatched companion must NOT count toward the collection
    // (which is what the assignment bound reads).
    const profile: GuestProfile = {
      ...createGuestProfile({ guestId: 'g', starterCompanionId: 'pikachu-family', now: NOW }),
      collection: [
        { referenceId: 'g:starter', companionId: 'pikachu-family', acquiredAt: NOW, acquisition: 'starter' },
      ],
    }
    const claimed = claimDailyDraw(createEncounterState(), new Date('2026-10-07T12:00:00'), catalog, ['pikachu-family'])
    const grown = applyEncounterDraws(profile, claimed.newDraws, NOW)

    expect(claimed.newDraws).toHaveLength(1)
    expect(pendingEggs(grown)).toHaveLength(1)
    expect(grown.collection).toHaveLength(1)
  })

  it('keeps the companion out of the collection until the egg is opened', () => {
    const profile = createGuestProfile({ guestId: 'g', starterCompanionId: 'pikachu-family', now: NOW })
    const claimed = claimDailyDraw(createEncounterState(), new Date('2026-10-07T12:00:00'), catalog, [])
    const laid = applyEncounterDraws(profile, claimed.newDraws, NOW)

    const egg = pendingEggs(laid)[0]
    expect(egg).toBeDefined()
    const outcome = hatchEgg(laid, egg!.drawId, NOW)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(pendingEggs(outcome.profile)).toHaveLength(0)
    expect(outcome.profile.collection).toHaveLength(2)
    expect(outcome.profile.collection[1]?.companionId).toBe(claimed.newDraws[0]?.selectedCompanionId)
  })

  it('is a no-op when there is nothing new to draw', () => {
    const profile = createGuestProfile({ guestId: 'g', starterCompanionId: 'pikachu-family', now: NOW })
    expect(applyEncounterDraws(profile, [], NOW)).toBe(profile)
  })

  it('lays no egg for a duplicate, because the duplicate was already banked as Essence', () => {
    const profile = createGuestProfile({ guestId: 'g', starterCompanionId: 'pikachu-family', now: NOW })
    // Own every species, so the draw is necessarily a duplicate.
    const owned = catalog.list().map((c) => c.id)
    const claimed = claimDailyDraw(createEncounterState(), new Date('2026-10-07T12:00:00'), catalog, owned)
    const grown = applyEncounterDraws(profile, claimed.newDraws, NOW)

    expect(claimed.newDraws[0]?.isDuplicate).toBe(true)
    expect(pendingEggs(grown)).toHaveLength(0)
    expect(grown.collection).toHaveLength(1)
  })
})

describe('the daily draw does not disturb the activity meter', () => {
  it('banks the rest of the meter rather than spending it', () => {
    // progress === threshold consumes exactly one threshold, so a meter at 40
    // should come back as 40, not 0 and not 140.
    const start: EncounterState = { ...createEncounterState(), meter: 40 }
    const r = claimDailyDraw(start, at(2026, 10, 7), catalog, [])
    expect(r.state.meter).toBe(40)
  })

  it('adds to totalProgress so the activity count is not lost', () => {
    const r = claimDailyDraw(createEncounterState(), at(2026, 10, 7), catalog, [])
    expect(r.state.totalProgress).toBe(100)
  })
})
