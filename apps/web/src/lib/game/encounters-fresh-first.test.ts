import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENCOUNTER_CONFIG,
  advanceEncounter,
  createEncounterState,
  type EncounterState,
  type EncounterTrigger,
} from './encounters'
import { PROTOTYPE_COMPANION_CATALOG } from './companion-catalog'

/**
 * The draw must not hand back a companion the viewer already owns while unowned ones
 * remain.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT: an already-owned companion is not a re-roll, it is
 * a NON-EVENT. `isDuplicate` routes it to Essence, which is not visible or spendable
 * anywhere, so the day reads as "nothing happened". Measured against the two-entry catalog
 * this replaced, a viewer owning only the starter got a companion on 32.5% of days, and a
 * viewer owning both got one never again.
 */

function trigger(overrides: Partial<EncounterTrigger> & Pick<EncounterTrigger, 'id'>): EncounterTrigger {
  return {
    progress: DEFAULT_ENCOUNTER_CONFIG.threshold,
    seed: 'seed',
    signals: { tags: [], languages: [], fileTypes: [] },
    ownedCompanionIds: [],
    ...overrides,
  }
}

function run(state: EncounterState, trig: EncounterTrigger) {
  return advanceEncounter(state, trig, PROTOTYPE_COMPANION_CATALOG)
}

describe('a draw prefers what the viewer does not have', () => {
  it('never returns a duplicate while any catalog entry is unowned', () => {
    const owned = ['pikachu-family']
    let state = createEncounterState()
    let duplicates = 0
    let draws = 0

    // 120 separate days, each with the collection pinned to "starter only". Before this
    // change, 67.5% of these resolved to a duplicate and produced nothing.
    for (let day = 0; day < 120; day += 1) {
      const result = run(state, trigger({ id: `daily:day-${day}`, seed: `seed-${day}`, ownedCompanionIds: owned }))
      state = result.state
      for (const draw of result.newDraws) {
        draws += 1
        if (draw.isDuplicate) duplicates += 1
      }
    }

    expect(draws).toBe(120)
    expect(duplicates).toBe(0)
  })

  it('persists only the pool it actually chose from', () => {
    const result = run(
      createEncounterState(),
      trigger({ id: 'daily:solo', ownedCompanionIds: ['pikachu-family'] }),
    )
    const draw = result.newDraws[0]
    expect(draw.selectedCompanionId).not.toBe('pikachu-family')
    // The snapshot validators read these ids as "companions this draw knows about", so a
    // narrowed pool still validates -- but an owned id must not appear as a candidate.
    expect(draw.weights.map((weight) => weight.companionId)).not.toContain('pikachu-family')
  })

  it('falls back to the full table once everything is owned, so Essence stays reachable', () => {
    const everything = PROTOTYPE_COMPANION_CATALOG.list().map((entry) => entry.id)
    let state = createEncounterState()
    let duplicates = 0
    let fresh = 0

    for (let day = 0; day < 30; day += 1) {
      const result = run(state, trigger({ id: `daily:day-${day}`, seed: `seed-${day}`, ownedCompanionIds: everything }))
      state = result.state
      for (const draw of result.newDraws) {
        if (draw.isDuplicate) duplicates += 1
        else fresh += 1
      }
    }

    // Without the fallback the pool would be empty and a complete collection would have no
    // draw behaviour at all: no duplicate, no Essence, nothing.
    expect(fresh).toBe(0)
    expect(duplicates).toBe(30)
  })

  it('does not hand the same companion to two draws in one batch', () => {
    // One trigger worth two draws. `owned` grows inside the loop, so the pool is
    // recomputed per draw rather than hoisted -- otherwise both draws would pick from the
    // same candidates and the second could repeat the first.
    const result = run(
      createEncounterState(),
      trigger({ id: 'batch:double', progress: DEFAULT_ENCOUNTER_CONFIG.threshold * 2 }),
    )
    const ids = result.newDraws.map((draw) => draw.selectedCompanionId)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(result.newDraws.every((draw) => !draw.isDuplicate)).toBe(true)
  })

  it('is still idempotent for a replayed trigger', () => {
    const trig = trigger({ id: 'daily:replay' })
    const first = run(createEncounterState(), trig)
    const second = run(first.state, trig)
    expect(second.ignored).toBe(true)
    expect(second.newDraws.map((draw) => draw.id)).toEqual(first.newDraws.map((draw) => draw.id))
  })
})
