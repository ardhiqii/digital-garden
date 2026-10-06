import { describe, expect, it } from 'vitest'
import { asCompanionId, asEventId, type EventLedger, type NormalizedEvent } from './events'
import { PROTOTYPE_COMPANION_CATALOG } from './companion-catalog'
import { createEncounterState } from './encounters'
import { createProductState } from './product-state'
import { createGuestProfile } from './guest-profile'
import {
  ACHIEVEMENTS,
  achievementContext,
  resolveAchievements,
  unlockedAchievements,
} from './achievements'

const now = '2026-08-28T10:00:00.000Z'

function event(id: string, overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId: asEventId(id),
    companionId: asCompanionId('pikachu-family'),
    source: 'built-in-editor',
    sourceId: 'guest-notes',
    provenance: 'local',
    category: 'new-note',
    occurredAt: now,
    ...overrides,
  }
}

function stateWithEvents(events: NormalizedEvent[], overrides: { encounters?: ReturnType<typeof createEncounterState> } = {}) {
  const profile = createGuestProfile({
    guestId: 'guest-1',
    starterCompanionId: 'pikachu-family',
    now,
  })
  const ledger: EventLedger = { events }
  return createProductState(
    profile,
    ledger,
    overrides.encounters ?? createEncounterState(),
    PROTOTYPE_COMPANION_CATALOG,
  )
}

describe('achievements', () => {
  it('a fresh guest unlocks only the baseline set', () => {
    const state = stateWithEvents([])
    const unlocked = unlockedAchievements(state).map((a) => a.id)
    // Only "Welcome" (a companion exists) is true on a brand-new profile.
    expect(unlocked).toEqual(['welcome'])
  })

  it('every achievement declares a unique id, a category, and a rarity', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.name.length).toBeGreaterThan(0)
      expect(achievement.description.length).toBeGreaterThan(0)
      expect(['craft', 'shipping', 'consistency', 'collection', 'meta']).toContain(achievement.category)
      expect(['common', 'rare', 'epic', 'legendary']).toContain(achievement.rarity)
    }
  })

  it('unlocks first_note at exactly one new-note event and not before', () => {
    const none = achievementContext(stateWithEvents([]))
    const one = achievementContext(stateWithEvents([event('e1')]))
    const firstNote = ACHIEVEMENTS.find((a) => a.id === 'first_note')!
    expect(firstNote.unlocked(none)).toBe(false)
    expect(firstNote.unlocked(one)).toBe(true)
  })

  it('unlocks century_club at exactly 100 notes', () => {
    // Spread across days, because a real source caps new notes per day (three,
    // in `markdown-events.ts`). A hundred notes in one day is a ledger no source
    // can produce, and the day's global budget would reject most of it. The
    // achievement is about having written a hundred notes, not about a single
    // impossible afternoon.
    const days = 40
    const make = (n: number) =>
      achievementContext(
        stateWithEvents(
          Array.from({ length: n }, (_, i) =>
            event(`n${i}`, {
              occurredAt: new Date(
                Date.UTC(2026, 7, 1 + Math.floor(i / 3) % days, 10),
              ).toISOString(),
            }),
          ),
        ),
      )
    const club = ACHIEVEMENTS.find((a) => a.id === 'century_club')!
    expect(club.unlocked(make(99))).toBe(false)
    expect(club.unlocked(make(100))).toBe(true)
  })

  it('is pure: the same state produces the same unlocked set', () => {
    const state = stateWithEvents([event('a'), event('b')])
    const first = unlockedAchievements(state).map((a) => a.id)
    const second = unlockedAchievements(state).map((a) => a.id)
    expect(first).toEqual(second)
  })

  it('reports progress in 0..1 for every achievement on any state', () => {
    const state = stateWithEvents([event('a')])
    for (const entry of resolveAchievements(state)) {
      expect(entry.progress).toBeGreaterThanOrEqual(0)
      expect(entry.progress).toBeLessThanOrEqual(1)
    }
  })

  it('sorts unlocked achievements before locked ones', () => {
    const state = stateWithEvents([event('a')])
    const resolved = resolveAchievements(state)
    const firstLocked = resolved.findIndex((entry) => !entry.unlocked)
    if (firstLocked !== -1) {
      // Nothing unlocked may appear after the first locked entry.
      expect(resolved.slice(firstLocked).every((entry) => !entry.unlocked)).toBe(true)
    }
  })

  it('detects a 7-day daily streak from event timestamps', () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = String(10 + i).padStart(2, '0')
      return event(`d${i}`, {
        category: 'qualifying-active-day',
        occurredAt: `2026-08-${day}T09:00:00.000Z`,
      })
    })
    const ctx = achievementContext(stateWithEvents(days))
    const week = ACHIEVEMENTS.find((a) => a.id === 'week_streak')!
    expect(week.unlocked(ctx)).toBe(true)

    // Six consecutive days must not unlock it.
    const six = achievementContext(stateWithEvents(days.slice(0, 6)))
    expect(week.unlocked(six)).toBe(false)
  })

  it('does not count a gap as a streak', () => {
    const events = [
      event('a', { category: 'qualifying-active-day', occurredAt: '2026-08-10T09:00:00.000Z' }),
      event('b', { category: 'qualifying-active-day', occurredAt: '2026-08-11T09:00:00.000Z' }),
      // gap
      event('c', { category: 'qualifying-active-day', occurredAt: '2026-08-20T09:00:00.000Z' }),
    ]
    const ctx = achievementContext(stateWithEvents(events))
    const week = ACHIEVEMENTS.find((a) => a.id === 'week_streak')!
    expect(week.unlocked(ctx)).toBe(false)
  })

  it('uses the event timestamp for night_owl, not the current time', () => {
    const night = achievementContext(
      stateWithEvents([event('n', { occurredAt: '2026-08-28T02:00:00.000Z' })]),
    )
    const day = achievementContext(
      stateWithEvents([event('d', { occurredAt: '2026-08-28T14:00:00.000Z' })]),
    )
    const owl = ACHIEVEMENTS.find((a) => a.id === 'night_owl')!
    expect(owl.unlocked(night)).toBe(true)
    expect(owl.unlocked(day)).toBe(false)
  })

  it('uses the event timestamp for weekend_warrior', () => {
    // 2026-08-29 is a Saturday; 2026-08-28 is a Friday.
    const saturday = achievementContext(
      stateWithEvents([event('s', { occurredAt: '2026-08-29T12:00:00.000Z' })]),
    )
    const friday = achievementContext(
      stateWithEvents([event('f', { occurredAt: '2026-08-28T12:00:00.000Z' })]),
    )
    const weekend = ACHIEVEMENTS.find((a) => a.id === 'weekend_warrior')!
    expect(weekend.unlocked(saturday)).toBe(true)
    expect(weekend.unlocked(friday)).toBe(false)
  })

  it('requires both provenances for both_worlds', () => {
    const localOnly = achievementContext(stateWithEvents([event('l')]))
    const verifiedOnly = achievementContext(
      stateWithEvents([event('v', { provenance: 'verified', source: 'github' })]),
    )
    const both = achievementContext(
      stateWithEvents([
        event('l'),
        event('v2', { provenance: 'verified', source: 'github' }),
      ]),
    )
    const worlds = ACHIEVEMENTS.find((a) => a.id === 'both_worlds')!
    expect(worlds.unlocked(localOnly)).toBe(false)
    expect(worlds.unlocked(verifiedOnly)).toBe(false)
    expect(worlds.unlocked(both)).toBe(true)
  })

  it('does not let an uncapped category bypass the ledger caps', () => {
    // Capped events: many qualifying-active-day events on the SAME day share a
    // cap key, so only the capped count should be visible to predicates.
    const sameDay = Array.from({ length: 10 }, (_, i) =>
      event(`cap${i}`, {
        category: 'qualifying-active-day',
        occurredAt: `2026-08-28T0${i}:00:00.000Z`,
        cap: { key: 'github:acct:2026-08-28:qualifying-active-day', limit: 1 },
      }),
    )
    const ctx = achievementContext(stateWithEvents(sameDay))
    // The ledger accepts one; the predicate must see one, not ten.
    expect(ctx.events.filter((e) => e.category === 'qualifying-active-day')).toHaveLength(1)
  })

  it('never reads note content, paths, titles, or tags', () => {
    // The context shape is the contract: it carries categories and timestamps
    // only. If a field for content were ever added, this assertion fails.
    const ctx = achievementContext(stateWithEvents([event('a')]))
    const allowedKeys = [
      'events',
      'companionCount',
      'encounteredCompanionIds',
      'duplicateDraws',
      'drawCount',
      'distinctCompanionIds',
      'essenceFamilies',
      'hasLocalEvent',
      'hasVerifiedEvent',
      'activeCompanionAtMastery',
      'totalXp',
    ].sort()
    expect(Object.keys(ctx).sort()).toEqual(allowedKeys)
    // And each event carries only category + timestamp.
    for (const entry of ctx.events) {
      expect(Object.keys(entry).sort()).toEqual(['category', 'occurredAt'])
    }
  })
})
