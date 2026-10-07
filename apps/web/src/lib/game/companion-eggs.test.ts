/**
 * An egg is the difference between a draw that happened and a draw the user
 * attended. The properties pinned here are the ones whose failure is silent: a
 * duplicate laid as an egg opens onto nothing, and an egg that can hatch twice
 * puts one roll in the collection as two companions.
 */

import { describe, expect, it } from 'vitest'
import { createGuestProfile, type GuestProfile } from './guest-profile'
import {
  eggCount,
  hatchAllEggs,
  hatchEgg,
  layEggs,
  pendingEggs,
  pruneEggs,
  type PendingEgg,
} from './companion-eggs'
import type { PersistedEncounterDraw } from './encounters'

const NOW = '2026-10-07T12:00:00.000Z'

function draw(overrides: Partial<PersistedEncounterDraw> = {}): PersistedEncounterDraw {
  return {
    id: 'guest:0',
    sequence: 0,
    triggerId: 'daily:2026-10-07',
    seed: 'daily:2026-10-07',
    selectedCompanionId: 'ditto-like',
    selectedFamilyId: 'ditto',
    isDuplicate: false,
    essenceAwarded: 0,
    weights: [],
    ...overrides,
  }
}

function profile(): GuestProfile {
  return createGuestProfile({ guestId: 'guest', starterCompanionId: 'pikachu-family', now: NOW })
}

describe('laying', () => {
  it('turns a new draw into an egg', () => {
    const p = layEggs(profile(), [draw()], NOW)
    expect(eggCount(p)).toBe(1)
    expect(pendingEggs(p)[0]?.companionId).toBe('ditto-like')
  })

  it('does NOT lay an egg for a duplicate', () => {
    // The duplicate was already banked as Essence at draw time, so an egg for it
    // would open onto nothing: a reward that punishes.
    const p = layEggs(profile(), [draw({ isDuplicate: true, essenceAwarded: 3 })], NOW)
    expect(eggCount(p)).toBe(0)
  })

  it('is a no-op when nothing is new', () => {
    const p = profile()
    expect(layEggs(p, [], NOW)).toBe(p)
  })

  it('does not lay a second egg for the same draw', () => {
    const once = layEggs(profile(), [draw()], NOW)
    const twice = layEggs(once, [draw()], NOW)
    expect(eggCount(twice)).toBe(1)
    expect(twice).toBe(once)
  })

  it('keeps eggs in laying order', () => {
    let p = layEggs(profile(), [draw({ id: 'guest:0' })], NOW)
    p = layEggs(p, [draw({ id: 'guest:1', selectedCompanionId: 'pikachu-family' })], NOW)
    expect(pendingEggs(p).map((e) => e.drawId)).toEqual(['guest:0', 'guest:1'])
  })
})

describe('hatching', () => {
  it('moves the companion from the egg into the collection', () => {
    const laid = layEggs(profile(), [draw()], NOW)
    const outcome = hatchEgg(laid, 'guest:0', NOW)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(eggCount(outcome.profile)).toBe(0)
    expect(outcome.profile.collection).toHaveLength(2)
    expect(outcome.profile.collection[1]?.companionId).toBe('ditto-like')
    // The identity is the draw id on both sides, so anything referencing it before
    // the hatch still resolves after.
    expect(outcome.profile.collection[1]?.referenceId).toBe('guest:0')
  })

  it('refuses to hatch the same egg twice', () => {
    const laid = layEggs(profile(), [draw()], NOW)
    const first = hatchEgg(laid, 'guest:0', NOW)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = hatchEgg(first.profile, 'guest:0', NOW)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.reason).toBe('already-hatched')
    // One roll, one collection entry.
    expect(first.profile.collection).toHaveLength(2)
  })

  it('refuses an egg that does not exist, and says which case it was', () => {
    const outcome = hatchEgg(profile(), 'nope', NOW)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toBe('egg-not-found')
  })

  it('leaves the profile untouched when it refuses', () => {
    const p = layEggs(profile(), [draw()], NOW)
    const outcome = hatchEgg(p, 'missing', NOW)
    expect(outcome.ok).toBe(false)
    expect(eggCount(p)).toBe(1)
  })

  it('does not add the companion to the collection before hatching', () => {
    // The assignment bound reads the collection, so an unhatched companion must
    // not count as owned or a user could dress a repository with an egg.
    const laid = layEggs(profile(), [draw()], NOW)
    expect(laid.collection).toHaveLength(1)
  })
})

describe('hatching everything at once', () => {
  it('empties the inventory in one write', () => {
    let p = layEggs(profile(), [draw({ id: 'guest:0' })], NOW)
    p = layEggs(p, [draw({ id: 'guest:1', selectedCompanionId: 'pikachu-family' })], NOW)

    const all = hatchAllEggs(p, NOW)
    expect(eggCount(all)).toBe(0)
    expect(all.collection).toHaveLength(3)
  })

  it('is a no-op when there is nothing waiting', () => {
    const p = profile()
    expect(hatchAllEggs(p, NOW)).toBe(p)
  })

  it('agrees with hatching them one by one', () => {
    let p = layEggs(profile(), [draw({ id: 'guest:0' })], NOW)
    p = layEggs(p, [draw({ id: 'guest:1', selectedCompanionId: 'pikachu-family' })], NOW)

    const all = hatchAllEggs(p, NOW)
    const oneByOne = pendingEggs(p).reduce((acc, egg) => {
      const outcome = hatchEgg(acc, egg.drawId, NOW)
      return outcome.ok ? outcome.profile : acc
    }, p)

    expect(all.collection.map((c) => c.referenceId)).toEqual(
      oneByOne.collection.map((c) => c.referenceId),
    )
  })
})

describe('pruning', () => {
  it('drops an egg whose draw is already owned', () => {
    const p = profile()
    const handEdited: GuestProfile = {
      ...p,
      eggs: [
        { drawId: 'guest:0', companionId: 'ditto-like', laidAt: NOW } satisfies PendingEgg,
      ],
      collection: [
        ...p.collection,
        { referenceId: 'guest:0', companionId: 'ditto-like', acquiredAt: NOW, acquisition: 'encounter' },
      ],
    }
    expect(pruneEggs(handEdited).eggs).toEqual([])
  })

  it('drops a duplicated egg', () => {
    const p = profile()
    const handEdited: GuestProfile = {
      ...p,
      eggs: [
        { drawId: 'guest:0', companionId: 'ditto-like', laidAt: NOW },
        { drawId: 'guest:0', companionId: 'ditto-like', laidAt: NOW },
      ],
    }
    expect(pruneEggs(handEdited).eggs).toHaveLength(1)
  })

  it('leaves a clean profile by identity', () => {
    const p = layEggs(profile(), [draw()], NOW)
    expect(pruneEggs(p)).toBe(p)
  })
})
