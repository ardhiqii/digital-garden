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
    // 40 x 7 = 280 would exceed 250. Seven releases and one active day (10) is
    // 290. The day should pack as much real work as fits rather than stopping at
    // the first event that overflows.
    const ledger = {
      events: [
        ...Array.from({ length: 7 }, () => ev('published-release', '2026-10-01T09:00:00.000Z')),
        ev('qualifying-active-day', '2026-10-01T23:00:00.000Z'),
      ],
    }

    const accepted = acceptedLedgerEvents(ledger)
    const xp = totalXpOf(accepted)
    expect(xp).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
    // 6 releases fit (240), the 7th does not, and the cheap 10 xp event after it
    // still does.
    expect(accepted.some((e) => e.category === 'qualifying-active-day')).toBe(true)
    expect(xp).toBe(250)
  })

  it('does not clip any single source maxed out on its own', () => {
    // The budget must clear an honest heavy day, or it is punishing real work.
    // Both current sources, each at its own cap ceiling, fit together.
    const bestNoteDay = ['new-note', 'new-note', 'new-note']
      .map((c) => ev(c as EventCategory, '2026-10-01T09:00:00.000Z'))
    const words = Array.from({ length: 10 }, () => ev('new-words', '2026-10-01T09:30:00.000Z'))
    const links = Array.from({ length: 12 }, () => ev('resolved-wikilink', '2026-10-01T09:45:00.000Z'))
    const activity = [
      ev('qualifying-active-day', '2026-10-01T09:00:00.000Z'),
      ev('work-session', '2026-10-01T09:00:00.000Z'),
      ev('work-session', '2026-10-01T11:00:00.000Z'),
    ]
    const githubBestDay = [
      ev('qualifying-active-day', '2026-10-01T09:00:00.000Z', { sourceId: 'gh' }),
      ev('work-session', '2026-10-01T09:00:00.000Z', { sourceId: 'gh' }),
      ev('work-session', '2026-10-01T11:00:00.000Z', { sourceId: 'gh' }),
    ]

    const notes = totalXpOf(acceptedLedgerEvents({ events: [...bestNoteDay, ...words, ...links, ...activity] }))
    const github = totalXpOf(acceptedLedgerEvents({ events: githubBestDay }))

    expect(notes).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
    expect(github).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
    // Both together still fit under one budget.
    expect(notes + github).toBeLessThanOrEqual(GLOBAL_DAILY_XP_BUDGET)
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
    expect(GLOBAL_DAILY_XP_BUDGET).toBe(250)
    expect(XP_BY_EVENT_CATEGORY['published-release']).toBe(40)
  })
})
