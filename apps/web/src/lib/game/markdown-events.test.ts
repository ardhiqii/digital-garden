import { describe, expect, it } from 'vitest'
import { CONTENT_DAILY_LIMITS, normalizeMarkdownEvents } from './markdown-events'

const companionId = 'pikachu-default'
/** Scan time: the trusted clock the daily caps bucket by. */
const now = '2026-08-28T12:00:00.000Z'

describe('normalizeMarkdownEvents', () => {
  it('emits derived events for a new note without including note content', () => {
    const events = normalizeMarkdownEvents({
      sourceId: 'vault:main',
      companionId,
      previous: [],
      current: [
        {
          path: 'projects/alpha.md',
          content: `---\ntags: [alpha]\n---\n${'word '.repeat(205)} [[README]]`,
          modifiedAt: '2026-08-28T09:15:00.000Z',
        },
        {
          path: 'README.md',
          content: '# Readme',
          modifiedAt: '2026-08-28T09:00:00.000Z',
        },
      ],
      now,
    })

    const categories = events.map((event) => event.category)
    expect(categories.filter((category) => category === 'new-note')).toHaveLength(2)
    expect(categories.filter((category) => category === 'new-words')).toHaveLength(2)
    expect(categories).toContain('resolved-wikilink')
    expect(categories).toContain('qualifying-active-day')
    expect(categories).toContain('work-session')
    expect(events.every((event) => event.provenance === 'local')).toBe(true)
    expect(events.every((event) => !JSON.stringify(event).includes('word word'))).toBe(true)
    expect(events.filter((event) => event.category === 'new-words')).toHaveLength(2)
    // The day comes from the scan clock, not from any file's mtime, and the key
    // carries no sourceId: every mounted folder shares one daily budget.
    expect(events.find((event) => event.category === 'qualifying-active-day')?.cap).toEqual({
      key: 'mounted-markdown:2026-08-28:qualifying-active-day',
      limit: 1,
    })
  })

  it('caps content events so a scan cannot pay without bound', () => {
    const events = normalizeMarkdownEvents({
      sourceId: 'vault:main',
      companionId,
      previous: [],
      current: [
        {
          path: 'big.md',
          content: 'word '.repeat(5000),
          modifiedAt: '2026-08-28T09:00:00.000Z',
        },
      ],
      now,
    })

    const words = events.find((event) => event.category === 'new-words')
    expect(words?.cap).toEqual({
      key: 'mounted-markdown:2026-08-28:new-words',
      limit: CONTENT_DAILY_LIMITS['new-words'],
    })
  })

  it('charges a scan to the clock day even when every file is backdated', () => {
    const events = normalizeMarkdownEvents({
      sourceId: 'vault:main',
      companionId,
      previous: [],
      current: [
        {
          path: 'old.md',
          content: '# Old',
          modifiedAt: '2019-01-01T00:00:00.000Z',
        },
      ],
      now: '2026-08-28T12:00:00.000Z',
    })

    expect(events.find((event) => event.category === 'new-note')?.cap?.key).toBe(
      'mounted-markdown:2026-08-28:new-note',
    )
  })

  it('is quiet for an unchanged scan and only counts net new words on edits', () => {
    const previous = [
      {
        path: 'note.md',
        content: 'one two three four five',
        modifiedAt: '2026-08-27T09:00:00.000Z',
      },
    ]

    expect(
      normalizeMarkdownEvents({
        sourceId: 'vault:main',
        companionId,
        previous,
        current: previous,
        now,
      }),
    ).toEqual([])

    const edited = normalizeMarkdownEvents({
      sourceId: 'vault:main',
      companionId,
      previous,
      current: [
        {
          ...previous[0],
          content: 'one two three four five six seven eight nine ten eleven twelve',
          modifiedAt: '2026-08-28T11:00:00.000Z',
        },
      ],
      now,
    })

    expect(edited.filter((event) => event.category === 'new-words')).toHaveLength(0)
    expect(edited.map((event) => event.category)).toEqual(['qualifying-active-day', 'work-session'])
  })

  it('rejects unsafe relative paths', () => {
    expect(() =>
      normalizeMarkdownEvents({
        sourceId: 'vault:main',
        companionId,
        previous: [],
        current: [{ path: '../secret.md', content: 'x', modifiedAt: '2026-08-28T09:00:00.000Z' }],
        now,
      }),
    ).toThrow('Invalid Markdown path')
  })

  it('rejects a malformed scan time rather than silently bucketing it', () => {
    expect(() =>
      normalizeMarkdownEvents({
        sourceId: 'vault:main',
        companionId,
        previous: [],
        current: [{ path: 'a.md', content: 'x', modifiedAt: '2026-08-28T09:00:00.000Z' }],
        now: 'not-a-date',
      }),
    ).toThrow('Invalid Markdown timestamp')
  })
})
