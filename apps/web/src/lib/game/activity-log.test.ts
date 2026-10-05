import { describe, expect, it } from 'vitest'
import {
  asCompanionId,
  asEventId,
  type EventCategory,
  type EventLedger,
  type NormalizedEvent,
} from './events'
import { CATEGORY_LABEL, resolveActivityLog, groupActivityLogByCompanion } from './activity-log'

let seq = 0
function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  seq += 1
  return {
    eventId: asEventId(`evt-${String(seq).padStart(4, '0')}`),
    companionId: asCompanionId('gengar'),
    source: 'github',
    sourceId: 'ardhiqii',
    provenance: 'verified',
    category: 'merged-pull-request',
    occurredAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  } as NormalizedEvent
}

function ledgerOf(events: NormalizedEvent[]): EventLedger {
  return { events }
}

describe('resolveActivityLog', () => {
  it('names the repository each event came from', () => {
    const log = resolveActivityLog(
      ledgerOf([
        event({
          category: 'merged-pull-request',
          metadata: { repositoryId: '12345', repositoryName: 'ardhiqii/terrarium' },
        }),
      ]),
    )

    expect(log.entries).toHaveLength(1)
    expect(log.entries[0].sourceLabel).toBe('ardhiqii/terrarium')
    expect(log.entries[0].label).toBe(CATEGORY_LABEL['merged-pull-request'])
    expect(log.entries[0].xp).toBe(25)
    expect(log.entries[0].counted).toBe(true)
  })

  it('falls back to the account name when no repository was recorded', () => {
    const log = resolveActivityLog(ledgerOf([event({ sourceId: 'ardhiqii' })]))
    expect(log.entries[0].sourceLabel).toBe('ardhiqii')
  })

  it('scopes the log to one companion, so only that creature is credited', () => {
    const log = resolveActivityLog(
      ledgerOf([
        event({ companionId: asCompanionId('gengar') }),
        event({ companionId: asCompanionId('alakazam') }),
        event({ companionId: asCompanionId('gengar') }),
      ]),
      { companionId: 'gengar' },
    )

    expect(log.entries).toHaveLength(2)
    expect(log.totalXp).toBe(50)
    expect(log.entries.every((entry) => String(entry.companionId) === 'gengar')).toBe(true)
  })

  it('totals only the XP that actually counted', () => {
    const log = resolveActivityLog(ledgerOf([event(), event()]))
    expect(log.totalXp).toBe(50)
  })

  it('lists events a daily cap rejected, with a reason and zero xp', () => {
    const shared = { key: 'github:ardhiqii:2026-10-01:merged-pull-request', limit: 1 }
    const log = resolveActivityLog(
      ledgerOf([
        event({ occurredAt: '2026-10-01T09:00:00.000Z', cap: shared }),
        event({ occurredAt: '2026-10-01T18:00:00.000Z', cap: shared }),
      ]),
    )

    expect(log.entries).toHaveLength(2)
    expect(log.skippedCount).toBe(1)
    // The earlier event wins the cap bucket.
    expect(log.entries[1].counted).toBe(true)
    expect(log.entries[0].counted).toBe(false)
    expect(log.entries[0].xp).toBe(0)
    expect(log.entries[0].skipReason).toBeTruthy()
    expect(log.totalXp).toBe(25)
  })

  it('orders newest first, with a stable tie-break', () => {
    const log = resolveActivityLog(
      ledgerOf([
        event({ occurredAt: '2026-10-01T09:00:00.000Z' }),
        event({ occurredAt: '2026-10-03T09:00:00.000Z' }),
        event({ occurredAt: '2026-10-02T09:00:00.000Z' }),
      ]),
    )

    expect(log.entries.map((entry) => entry.occurredAt)).toEqual([
      '2026-10-03T09:00:00.000Z',
      '2026-10-02T09:00:00.000Z',
      '2026-10-01T09:00:00.000Z',
    ])
  })

  it('does not repeat a replayed delivery', () => {
    const once = event({ eventId: asEventId('same-id') })
    const log = resolveActivityLog(ledgerOf([once, { ...once }]))
    expect(log.entries).toHaveLength(1)
    expect(log.totalXp).toBe(25)
  })

  it('counts a capped event as capped even when it arrives from another source', () => {
    // Same cap key, different companions: switching companions must not bypass
    // the limit, which is the guarantee acceptedLedgerEvents already makes.
    const shared = { key: 'github:ardhiqii:2026-10-01:successful-ci', limit: 1 }
    const log = resolveActivityLog(
      ledgerOf([
        event({ companionId: asCompanionId('gengar'), category: 'successful-ci', cap: shared }),
        event({
          companionId: asCompanionId('alakazam'),
          category: 'successful-ci',
          cap: shared,
          occurredAt: '2026-10-01T11:00:00.000Z',
        }),
      ]),
    )
    expect(log.entries.filter((entry) => entry.counted)).toHaveLength(1)
  })

  it('reports a quiet ledger as empty rather than throwing', () => {
    const log = resolveActivityLog(ledgerOf([]))
    expect(log.entries).toEqual([])
    expect(log.totalXp).toBe(0)
    expect(log.skippedCount).toBe(0)
  })

  it('exposes no note content, titles, or file paths', () => {
    const log = resolveActivityLog(
      ledgerOf([
        event({
          source: 'mounted-markdown',
          category: 'new-note',
          sourceId: 'vault',
          provenance: 'local',
          metadata: { repositoryName: 'notes' },
        }),
      ]),
    )

    const serialized = JSON.stringify(log)
    // The only fields the entry contract allows are identifiers and counts.
    const allowed = new Set([
      'eventId', 'companionId', 'occurredAt', 'category', 'label', 'source',
      'sourceLabel', 'provenance', 'xp', 'counted', 'skipReason',
    ])
    for (const entry of log.entries) {
      for (const key of Object.keys(entry)) {
        expect(allowed.has(key)).toBe(true)
      }
    }
    expect(serialized).not.toContain('title')
    expect(serialized).not.toContain('path')
  })

  it('labels every category it can emit', () => {
    const categories: EventCategory[] = [
      'qualifying-active-day', 'work-session', 'new-note', 'new-words',
      'resolved-wikilink', 'merged-pull-request', 'published-release',
      'closed-linked-issue', 'successful-ci',
    ]
    for (const category of categories) {
      expect(CATEGORY_LABEL[category]).toBeTruthy()
      const log = resolveActivityLog(ledgerOf([event({ category })]))
      expect(log.entries[0].label).toBe(CATEGORY_LABEL[category])
    }
  })
})

describe('groupActivityLogByCompanion', () => {
  it('keeps each companion in its own bucket', () => {
    const grouped = groupActivityLogByCompanion(
      ledgerOf([
        event({ companionId: asCompanionId('gengar') }),
        event({ companionId: asCompanionId('alakazam') }),
        event({ companionId: asCompanionId('alakazam') }),
      ]),
    )

    expect(grouped.get(asCompanionId('gengar'))?.totalXp).toBe(25)
    expect(grouped.get(asCompanionId('alakazam'))?.totalXp).toBe(50)
  })

  it('returns an empty map for an empty ledger', () => {
    expect(groupActivityLogByCompanion(ledgerOf([])).size).toBe(0)
  })
})
