/**
 * Guards the local note source against farming.
 *
 * WHY THE LEDGER IS ACCUMULATED HERE: the caps are enforced by
 * `acceptedLedgerEvents`, which is a function of the WHOLE ledger, not of one
 * normalization batch. Measuring a single batch makes the caps look absent,
 * because a batch that stays under the limit always passes. So each round feeds
 * its events into one growing ledger, exactly as `applyProductEvents` does, and
 * acceptance is evaluated once at the end.
 *
 * THE VECTORS BELOW ARE THE ONES A RED TEAM ACTUALLY BROKE, each measured before
 * the fix. Every one earned unbounded XP in a single real day: forging a file's
 * mtime, renaming a file, and mounting the same content under several folder
 * names. They are here so a future change cannot quietly reopen one.
 */
import { describe, expect, it } from 'vitest'
import {
  CONTENT_DAILY_LIMITS,
  normalizeMarkdownEvents,
  type MarkdownFileSnapshot,
} from './markdown-events'
import {
  acceptedLedgerEvents,
  XP_BY_EVENT_CATEGORY,
  type NormalizedEvent,
} from './events'

const SOURCE = 'mounted-markdown:test-vault'
const NOW = '2026-10-01T12:00:00.000Z'
const CONTENT_DAY = '2026-10-01T10:00:00.000Z'

type ScanInput = {
  sourceId?: string
  previous: readonly MarkdownFileSnapshot[]
  current: readonly MarkdownFileSnapshot[]
  now?: string
}

function scan({ sourceId = SOURCE, previous, current, now = NOW }: ScanInput): readonly NormalizedEvent[] {
  return normalizeMarkdownEvents({
    sourceId,
    companionId: 'pikachu-family',
    previous,
    current,
    now,
  })
}

function note(path: string, content: string, modifiedAt = CONTENT_DAY): MarkdownFileSnapshot {
  return { path, content, modifiedAt }
}

/** The ceiling one day may pay, across every folder, given the caps. */
const DAILY_CEILING =
  CONTENT_DAILY_LIMITS['new-note'] * XP_BY_EVENT_CATEGORY['new-note'] +
  CONTENT_DAILY_LIMITS['new-words'] * XP_BY_EVENT_CATEGORY['new-words'] +
  CONTENT_DAILY_LIMITS['resolved-wikilink'] * XP_BY_EVENT_CATEGORY['resolved-wikilink'] +
  XP_BY_EVENT_CATEGORY['qualifying-active-day'] +
  XP_BY_EVENT_CATEGORY['work-session'] * 2

function acceptedXp(events: readonly NormalizedEvent[]): number {
  return acceptedLedgerEvents({ events }).reduce(
    (sum, event) => sum + (XP_BY_EVENT_CATEGORY[event.category] ?? 0),
    0,
  )
}

function acceptedIn(events: readonly NormalizedEvent[], category: string): number {
  return acceptedLedgerEvents({ events }).filter((event) => event.category === category).length
}

describe('farming the local note source', () => {
  it('caps one file padded over and over in a single day', () => {
    const events: NormalizedEvent[] = []
    let previous: readonly MarkdownFileSnapshot[] = []

    for (let round = 1; round <= 10; round += 1) {
      const current = [note('diary.md', `# Diary\n\n${'word '.repeat(round * 500)}`)]
      events.push(...scan({ previous, current }))
      previous = current
    }

    // Ten rounds would be 50 buckets uncapped (250 xp of words alone).
    expect(acceptedIn(events, 'new-words')).toBe(CONTENT_DAILY_LIMITS['new-words'])
    // One file, so one new-note at most.
    expect(acceptedIn(events, 'new-note')).toBe(1)
  })

  it('caps bulk-creating files in a single day', () => {
    const current = Array.from({ length: 60 }, (_, index) =>
      note(`note-${index}.md`, `# Note ${index}\n\nSome text.`),
    )
    const events = scan({ previous: [], current })

    expect(acceptedIn(events, 'new-note')).toBe(CONTENT_DAILY_LIMITS['new-note'])
    expect(acceptedIn(events, 'new-words')).toBeLessThanOrEqual(CONTENT_DAILY_LIMITS['new-words'])
  })

  it('caps a flood of resolved wikilinks in a single day', () => {
    const current = [
      note('hub.md', `# Hub\n\n${Array.from({ length: 50 }, (_, i) => `[[Target ${i}]]`).join('\n')}`),
      ...Array.from({ length: 50 }, (_, i) => note(`Target ${i}.md`, `# Target ${i}\n`)),
    ]
    const events = scan({ previous: [], current })

    expect(acceptedIn(events, 'resolved-wikilink')).toBe(CONTENT_DAILY_LIMITS['resolved-wikilink'])
  })

  it('cannot be defeated by forging file mtimes across a year (measured 25,575 xp before)', () => {
    // The vector: 365 files spread over 365 distinct mtime days. While the cap
    // bucketed by mtime, that was 365 separate allowances in ONE scan.
    const forged = Array.from({ length: 365 }, (_, day) =>
      note(
        `y-${day}.md`,
        `# day ${day}\n\n${'word '.repeat(500)}`,
        new Date(Date.UTC(2026, 0, 1 + day)).toISOString(),
      ),
    )
    const events = scan({ previous: [], current: forged })

    expect(acceptedIn(events, 'new-note')).toBe(CONTENT_DAILY_LIMITS['new-note'])
    expect(acceptedIn(events, 'new-words')).toBe(CONTENT_DAILY_LIMITS['new-words'])
    expect(acceptedXp(events)).toBeLessThanOrEqual(DAILY_CEILING)
  })

  it('collapses byte-identical notes into one, which errs toward denying', () => {
    // A consequence of keying `new-note` to content: twenty files with the same
    // bytes are one note, because they are one thing written twice. That is the
    // same rule `new-words` already used (its id carries the content revision),
    // and it errs toward under-counting rather than toward a rename exploit.
    const events = scan({
      previous: [],
      current: Array.from({ length: 20 }, (_, i) => note(`copy-${i}.md`, '# identical\n')),
    })

    expect(acceptedIn(events, 'new-note')).toBe(1)
  })

  it('charges a backdated file to today, not to the date the user chose', () => {
    const events = scan({
      previous: [],
      current: [note('backdated.md', '# Backdated\n\n' + 'word '.repeat(1000), '2019-03-04T08:00:00.000Z')],
    })

    const wordEvent = acceptedLedgerEvents({ events }).find((event) => event.category === 'new-words')
    expect(wordEvent?.cap?.key).toBe('mounted-markdown:2026-10-01:new-words')
  })

  it('does not re-pay the new-note bonus when a file is renamed (measured 41 events before)', () => {
    // Renaming moves bytes only, so the note is not new. Keying the event to
    // content rather than path is what makes this hold.
    const content = '# Same content\n\nUnchanged.'
    const events = [
      ...scan({ previous: [], current: [note('old.md', content)] }),
      ...scan({ previous: [note('old.md', content)], current: [note('new.md', content)] }),
      ...scan({ previous: [note('new.md', content)], current: [note('renamed-again.md', content)] }),
    ]

    expect(acceptedIn(events, 'new-note')).toBe(1)
  })

  it('still pays a new note when the content genuinely changed', () => {
    const events = [
      ...scan({ previous: [], current: [note('a.md', '# A\n')] }),
      ...scan({ previous: [note('a.md', '# A\n')], current: [note('b.md', '# B, genuinely different\n')] }),
    ]

    expect(acceptedIn(events, 'new-note')).toBe(2)
  })

  it('shares one daily allowance across every mounted folder (measured 1,200 xp for 10 copies before)', () => {
    const files = Array.from({ length: 40 }, (_, i) =>
      note(`n-${i}.md`, `# x\n\n${'w '.repeat(500)}`),
    )
    const events: NormalizedEvent[] = []
    for (let copy = 0; copy < 10; copy += 1) {
      events.push(...scan({ sourceId: `mounted-markdown:Vault-copy-${copy}`, previous: [], current: files }))
    }

    // One budget, not ten: a folder name is not an identity.
    expect(acceptedIn(events, 'new-note')).toBe(CONTENT_DAILY_LIMITS['new-note'])
    expect(acceptedXp(events)).toBeLessThanOrEqual(DAILY_CEILING)
  })

  it('does not let renaming the folder mint a second allowance', () => {
    const files = Array.from({ length: 20 }, (_, i) =>
      note(`n-${i}.md`, `# note ${i}\n\n${'w '.repeat(400)}`),
    )
    const first = scan({ sourceId: 'mounted-markdown:MyVault', previous: [], current: files })
    const renamed = scan({ sourceId: 'mounted-markdown:MyVault-renamed', previous: [], current: files })

    expect(acceptedIn([...first, ...renamed], 'new-note')).toBe(CONTENT_DAILY_LIMITS['new-note'])
  })

  it('gives each day its own allowance', () => {
    const dayOne = scan({
      previous: [],
      current: Array.from({ length: 10 }, (_, i) => note(`d1-${i}.md`, `# day one ${i}\n`)),
      now: '2026-10-01T12:00:00.000Z',
    })
    const dayTwo = scan({
      previous: [],
      current: Array.from({ length: 10 }, (_, i) => note(`d2-${i}.md`, `# day two ${i}\n`)),
      now: '2026-10-02T12:00:00.000Z',
    })

    expect(acceptedIn([...dayOne, ...dayTwo], 'new-note')).toBe(CONTENT_DAILY_LIMITS['new-note'] * 2)
  })

  it('keeps every farming route inside the ceiling, and still pays an honest day', () => {
    const honest = scan({
      previous: [],
      current: [
        note('essay.md', `# Essay\n\n${'word '.repeat(900)}[[Notes on structure]]`),
        note('Notes on structure.md', '# Notes on structure\n\nSome thoughts.\n'),
      ],
    })

    const attacker = [
      ...scan({
        previous: [],
        current: Array.from({ length: 100 }, (_, i) =>
          note(`pad-${i}.md`, `# p\n\n${'word '.repeat(5000)}`, new Date(Date.UTC(2020, 0, 1 + i)).toISOString()),
        ),
      }),
      ...Array.from({ length: 5 }, (_, c) =>
        scan({
          sourceId: `mounted-markdown:copy-${c}`,
          previous: [],
          current: Array.from({ length: 50 }, (_, i) => note(`c${c}-${i}.md`, '# x\n\n' + 'w '.repeat(900))),
        }),
      ),
    ].flat()

    const honestXp = acceptedXp(honest)
    const attackerXp = acceptedXp(attacker)

    expect(honestXp).toBeGreaterThan(0)
    expect(attackerXp).toBeLessThanOrEqual(DAILY_CEILING)
    // A real writing day still earns a meaningful share of the ceiling, so the
    // caps do not make honest work pointless.
    expect(honestXp / DAILY_CEILING).toBeGreaterThan(0.5)
  })
})
