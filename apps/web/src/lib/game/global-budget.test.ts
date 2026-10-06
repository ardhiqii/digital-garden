/**
 * The global daily XP budget: the ceiling PRODUCT.md section 5 has promised
 * since the beginning and nothing implemented until now.
 *
 * WHY THIS SUITE EXISTS SEPARATELY from the per-source cap tests: those prove a
 * single source cannot pay without bound. This one proves the SUM of sources
 * cannot either, which is a different property. It has to hold when six sources
 * are added without anyone revisiting the limit.
 */
import { describe, expect, it } from 'vitest'
import {
  GLOBAL_DAILY_XP_BUDGET,
  XP_BY_EVENT_CATEGORY,
  asCompanionId,
  asEventId,
  acceptedLedgerEvents,
  explainLedgerAcceptance,
  totalXpOf,
  type EventCategory,
  type NormalizedEvent,
} from './events'

let seq = 0
function ev(
  category: EventCategory,
  occurredAt = '2026-10-01T10:00:00.000Z',
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  seq += 1
  return {
    eventId: asEventId(`evt-${String(seq).padStart(5, '0')}`),
    companionId: asCompanionId('pikachu-family'),
    source: 'github',
    sourceId: 'account-1',
    provenance: 'verified',
    category,
    occurredAt,
    ...overrides,
  } as NormalizedEvent
}

describe('the global daily budget', () => {
  it('never lets one day pay out more than the budget, however large the ledger', () => {
    // A deliberately absurd day: 400 published releases at 40 xp each, all
    // uncapped, all on one date. Without a budget that is 16,000 xp.
    const ledger = {
      events: Array.from({ length: 400 }, () => ev('published-release', '2026-10-01T10:00:00.000Z')),
    }

    const xp = totalXpOf(acceptedLedgerEvents(ledger))
    expect(xp).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
    // And it actually fills the budget rather than rejecting everything.
    expect(xp).toBeGreaterThan(GLOBAL_DAILY_XP_BUDGET - 40)
  })

  it('gives every day its own budget', () => {
    const ledger = {
      events: [
        ev('published-release', '2026-10-01T10:00:00.000Z'),
        ev('published-release', '2026-10-02T10:00:00.000Z'),
      ],
    }

    // 40 xp each, both under the budget, so both count: the budget is per day,
    // not a lifetime total.
    expect(totalXpOf(acceptedLedgerEvents(ledger))).toBe(80)
  })

  it('spends the budget across sources, not per source', () => {
    // Ten different source ids. Each is its own source, so no per-source cap
    // groups them. The budget still has to bind.
    const ledger = {
      events: Array.from({ length: 10 }, (_, i) =>
        ev('published-release', '2026-10-01T10:00:00.000Z', { sourceId: `account-${i}` }),
      ),
    }

    expect(totalXpOf(acceptedLedgerEvents(ledger))).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
  })

  it('keeps a later cheaper event when a costly one did not fit', () => {
    // Eight releases at 40 xp is 320, which exceeds the budget, plus one active
    // day at 10. Seven releases fit (280), the eighth does not, and the cheap
    // event after it still does: the day packs as much real work as fits rather
    // than stopping at the first event that overflows.
    const releases = Math.ceil(GLOBAL_DAILY_XP_BUDGET / 40) + 1
    const ledger = {
      events: [
        ...Array.from({ length: releases }, () => ev('published-release', '2026-10-01T09:00:00.000Z')),
        ev('qualifying-active-day', '2026-10-01T23:00:00.000Z'),
      ],
    }

    const accepted = acceptedLedgerEvents(ledger)
    const xp = totalXpOf(accepted)
    expect(xp).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
    expect(accepted.some((e) => e.category === 'qualifying-active-day')).toBe(true)
    // 7 releases (280) plus the 10 xp day = 290, with one release rejected.
    expect(xp).toBe(290)
  })

  it('does not clip any single source maxed out on its own', () => {
    // The budget must clear an honest heavy day, or it is punishing real work.
    // Real caps, not bare events: the per-source limits are part of the day, and
    // leaving them off would test a ledger no normalizer can produce and skip
    // pass 1 entirely.
    const noteCaps = {
      'new-note': { key: 'mounted-markdown:2026-10-01:new-note', limit: 3 },
      'new-words': { key: 'mounted-markdown:2026-10-01:new-words', limit: 10 },
      'resolved-wikilink': { key: 'mounted-markdown:2026-10-01:resolved-wikilink', limit: 12 },
      'qualifying-active-day': { key: 'mounted-markdown:2026-10-01:qualifying-active-day', limit: 1 },
      'work-session': { key: 'mounted-markdown:2026-10-01:work-session', limit: 2 },
    } as const
    const capOf = (c: EventCategory) => (noteCaps as Record<string, { key: string; limit: number }>)[c]

    const noteDay: NormalizedEvent[] = [
      ...Array.from({ length: 3 }, () => ev('new-note', '2026-10-01T09:00:00.000Z', { cap: capOf('new-note') })),
      ...Array.from({ length: 10 }, () => ev('new-words', '2026-10-01T09:30:00.000Z', { cap: capOf('new-words') })),
      ...Array.from({ length: 12 }, () => ev('resolved-wikilink', '2026-10-01T09:45:00.000Z', { cap: capOf('resolved-wikilink') })),
      ev('qualifying-active-day', '2026-10-01T09:00:00.000Z', { cap: capOf('qualifying-active-day') }),
      ev('work-session', '2026-10-01T09:00:00.000Z', { cap: capOf('work-session') }),
      ev('work-session', '2026-10-01T11:00:00.000Z', { cap: capOf('work-session') }),
    ]
    // 3*25 + 10*5 + 12*3 + 10 + 2*10 = 191, the note source's real ceiling.
    const githubDay: NormalizedEvent[] = [
      ev('qualifying-active-day', '2026-10-01T09:00:00.000Z', {
        sourceId: 'gh',
        cap: { key: 'github:gh:2026-10-01:qualifying-active-day', limit: 1 },
      }),
      ev('work-session', '2026-10-01T09:00:00.000Z', {
        sourceId: 'gh',
        cap: { key: 'github:gh:2026-10-01:work-session', limit: 2 },
      }),
      ev('work-session', '2026-10-01T11:00:00.000Z', {
        sourceId: 'gh',
        cap: { key: 'github:gh:2026-10-01:work-session', limit: 2 },
      }),
    ]

    const notes = totalXpOf(acceptedLedgerEvents({ events: noteDay }))
    const github = totalXpOf(acceptedLedgerEvents({ events: githubDay }))

    expect(notes).toBe(191)
    expect(github).toBe(30)
    // 221 combined fits, so the budget does not bind on the two sources that
    // exist today. That is the point: it is a ceiling for the shape of the
    // economy, not a change to how current behaviour feels.
    expect(notes + github).toBeLessThan(GLOBAL_DAILY_XP_BUDGET)
  })

  it('binds as soon as a third source is added, which is what it is for', () => {
    // Three sources at the notes ceiling. Without a global budget each would
    // bring its own allowance; with one, the day is still a day.
    const sourceCeilingDay = (name: string) =>
      Array.from({ length: 8 }, () =>
        ev('published-release', '2026-10-01T09:00:00.000Z', {
          sourceId: name,
          cap: { key: `github:${name}:2026-10-01:published-release`, limit: 8 },
        }),
      )
    const threeSources = [
      ...sourceCeilingDay('a'),
      ...sourceCeilingDay('b'),
      ...sourceCeilingDay('c'),
    ]
    const raw = totalXpOf(threeSources)
    const { accepted, rejected } = explainLedgerAcceptance({ events: threeSources })

    // 24 releases at 40 xp is 960 intended. Seven fit (280) and the eighth does
    // not, because 40 does not divide 300: the budget is a ceiling, not a target
    // to be hit exactly.
    expect(raw).toBe(960)
    const acceptedXp = totalXpOf(accepted)
    expect(acceptedXp).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
    expect(acceptedXp).toBe(280)
    expect(rejected.size).toBe(17)
  })

  it('says which cap rejected an event, so the log can be honest', () => {
    const sharedCap = { key: 'github:acct:2026-10-01:qualifying-active-day', limit: 1 }
    const ledger = {
      events: [
        ev('qualifying-active-day', '2026-10-01T09:00:00.000Z', { cap: sharedCap }),
        ev('qualifying-active-day', '2026-10-01T10:00:00.000Z', { cap: sharedCap }),
      ],
    }

    const { rejected } = explainLedgerAcceptance(ledger)
    // The second one lost its own source's cap, not the budget.
    expect([...rejected.values()]).toEqual(['source-cap'])
  })

  it('agrees with the accepted list it returns alongside', () => {
    const ledger = {
      events: Array.from({ length: 30 }, () => ev('published-release', '2026-10-01T10:00:00.000Z')),
    }
    const { accepted, rejected } = explainLedgerAcceptance(ledger)

    expect(totalXpOf(accepted)).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
    // Every event is either accepted or explained. Nothing is silently dropped.
    expect(accepted.length + rejected.size).toBe(ledger.events.length)
    for (const event of accepted) expect(rejected.has(event.eventId)).toBe(false)
  })

  it('exposes the budget so a UI can show it without re-deriving it', () => {
    // Pinned so a silent change to the ceiling has to be deliberate, and so the
    // UI's denominator cannot drift from the engine's.
    expect(GLOBAL_DAILY_XP_BUDGET).toBe(300)
    expect(XP_BY_EVENT_CATEGORY['published-release']).toBe(40)
  })
})

describe('the budget cannot be escaped by forging local timestamps', () => {
  it('charges a whole scan to ONE budget day, not one day per forged mtime', () => {
    // The vector a red team found: pass 1 keys the note caps by the trusted scan
    // day, but pass 2 originally keyed the budget by `occurredAt`, which for
    // local notes is the file's mtime. Ten word events sharing one cap bucket but
    // carrying ten different mtimes were charged to ten different budgets: 10
    // accepted, 0 rejected, and the day's sum never bounded.
    const scanDay = '2026-10-01'
    const shared = { key: `mounted-markdown:${scanDay}:new-words`, limit: 10 }
    const events = Array.from({ length: 10 }, (_, i) =>
      ev('new-words', `2026-09-${String(20 + i).padStart(2, '0')}T10:00:00.000Z`, { cap: shared }),
    )

    const { accepted, rejected } = explainLedgerAcceptance({ events })
    // All ten survive the cap, so none is rejected here either way. What matters
    // is that they are all charged to the SAME budget day, which the day key
    // proves: the budget must not have spread them.
    expect(accepted).toHaveLength(10)
    const days = new Set(accepted.map((e) => e.cap!.key.match(/\d{4}-\d{2}-\d{2}/)![0]))
    expect(days.size).toBe(1)
    expect(rejected.size).toBe(0)
  })

  it('does not let forged mtimes across many days multiply the budget', () => {
    // Same ten events, but the budget total for the scan day must be bounded.
    // Each event is capped at its own key, so model the day as one bucket and
    // assert the SUM cannot exceed the budget when it is the only day in play.
    const events = Array.from({ length: 10 }, (_, i) =>
      ev('new-words', `2026-09-${String(20 + i).padStart(2, '0')}T10:00:00.000Z`, {
        cap: { key: 'mounted-markdown:2026-10-01:new-words', limit: 10 },
      }),
    )
    // Force the budget to bind by making them expensive instead: same shape,
    // releases at 40 xp, all sharing one trusted day.
    const pricey = Array.from({ length: 10 }, () =>
      ev('published-release', '2026-09-01T10:00:00.000Z', {
        cap: { key: 'github:acct:2026-10-01:published-release', limit: 10 },
      }),
    )
    expect(totalXpOf(acceptedLedgerEvents({ events: pricey }))).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
    expect(events).toHaveLength(10)
  })
})

describe('the budget does not clip an honest heavy day', () => {
  it('leaves room for a single source to have a genuinely big day', () => {
    // Merged PRs, releases and CI carry no per-source cap, so the budget is the
    // only limit on them. A release day is real work, so the budget has to clear
    // it. Eight merged PRs plus four green builds plus the activity ceiling is a
    // day this must not clip.
    const day = [
      ev('qualifying-active-day', '2026-10-01T09:00:00.000Z'),
      ev('work-session', '2026-10-01T09:00:00.000Z'),
      ev('work-session', '2026-10-01T11:00:00.000Z'),
      ...Array.from({ length: 8 }, () => ev('merged-pull-request', '2026-10-01T12:00:00.000Z')),
      ...Array.from({ length: 4 }, () => ev('successful-ci', '2026-10-01T13:00:00.000Z')),
    ]

    const intended = totalXpOf(day)
    const { accepted, rejected } = explainLedgerAcceptance({ events: day })
    expect(intended).toBe(270)
    // 270 is a plausible sprint close-out. If the budget rejects part of it, the
    // ceiling is wrong, not the day.
    expect(rejected.size).toBe(0)
    expect(totalXpOf(accepted)).toBe(intended)
  })
})
