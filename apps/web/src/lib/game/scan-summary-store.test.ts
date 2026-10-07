/**
 * The scan memory that survives a reload.
 *
 * WHY THIS SUITE EXISTS: the scan runtime kept "what did the folder look like
 * last time" in a `useRef`. Closing the tab discarded it, so the next visit saw
 * every file as new, re-baselined, and awarded nothing. A user who wrote in
 * Obsidian daily and opened the site occasionally earned XP for almost none of
 * it. These tests pin the two properties that fix depends on: the memory
 * round-trips through storage, and it carries no note content.
 */
import { describe, expect, it } from 'vitest'
import {
  InMemoryScanSummaryStore,
  SCAN_SUMMARY_STORAGE_KEY,
  clearScanSummary,
  loadScanSummaries,
  saveScanSummary,
  summarizeScanFiles,
  summaryHash,
  summaryLinkTargets,
  summaryWordCount,
  type MarkdownScanSummary,
} from './scan-summary-store'
import { normalizeMarkdownEvents } from './markdown-events'

const NOW = '2026-10-01T12:00:00.000Z'

function file(path: string, content: string, modifiedAt = '2026-10-01T10:00:00.000Z') {
  return { path, content, modifiedAt }
}

describe('summarizeScanFiles', () => {
  it('keeps no note text, only derived numbers', () => {
    const secret = 'the quick brown fox jumped over a confidential plan'
    const [summary] = summarizeScanFiles([file('a.md', secret)])

    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('confidential')
    expect(serialized).not.toContain('quick brown')
    // What it does keep: a hash, a word count, a link count, and the mtime.
    expect(summary.hash).toBe(summaryHash(secret))
    expect(summary.words).toBe(summaryWordCount(secret))
    expect(summary.links).toBe(0)
  })

  it('counts body words only, ignoring frontmatter', () => {
    // The block must be closed and followed by whitespace, exactly as the
    // normalizer's `wordCount` requires, or the frontmatter stays in the count.
    const withFrontMatter = '---\ntitle: A note\ntags: [x]\n---\n\none two three'
    expect(summaryWordCount(withFrontMatter)).toBe(3)
    // A note with no frontmatter at all counts every word.
    expect(summaryWordCount('one two three four')).toBe(4)
  })

  it('collects lowercased wikilink targets, since "newly resolved" is a set difference', () => {
    expect(summaryLinkTargets('see [[Alpha]] and [[Beta|alias]]'))
      .toEqual(['alpha', 'beta'])
  })

  it('agrees with the normalizer on a heading anchor, which neither reads as a link', () => {
    // `[[gamma#head]]` is dropped, not captured as `gamma`. The regex excludes
    // `#` and the optional `|alias` group only accepts a pipe, so an anchored
    // wikilink matches nothing. That is the pre-existing behaviour of
    // `markdown-events.ts`, and this summary deliberately mirrors it: if these two
    // ever disagree, "did this link change" would answer differently depending on
    // which module you asked.
    expect(summaryLinkTargets('[[gamma#head]]')).toEqual([])
  })

  it('changes the hash when the content changes, and not otherwise', () => {
    const [before] = summarizeScanFiles([file('a.md', 'one two')])
    const [same] = summarizeScanFiles([file('a.md', 'one two')])
    const [changed] = summarizeScanFiles([file('a.md', 'one two three')])
    expect(before.hash).toBe(same.hash)
    expect(changed.hash).not.toBe(before.hash)
  })
})

describe('the summary survives a reload', () => {
  it('round-trips through storage', () => {
    const store = new InMemoryScanSummaryStore()
    const summary: MarkdownScanSummary = {
      sourceId: 'mounted-markdown:MyVault',
      observedAt: NOW,
      files: summarizeScanFiles([file('a.md', 'one two three')]),
    }
    saveScanSummary(store, summary)

    const loaded = loadScanSummaries(store)['mounted-markdown:MyVault']
    expect(loaded).toBeDefined()
    expect(loaded.files).toHaveLength(1)
    expect(loaded.files[0].words).toBe(3)
    expect(loaded.observedAt).toBe(NOW)
  })

  it('lets a second scan earn xp where a ref-based memory earned nothing', () => {
    // THE BUG: a page reload used to empty the memory, so this second scan looked
    // like a first observation, re-baselined, and produced no events at all.
    const store = new InMemoryScanSummaryStore()

    // Visit one: the folder is seen for the first time and baselined.
    const firstFiles = [file('diary.md', '# Diary\n\nsome words here')]
    saveScanSummary(store, {
      sourceId: 'mounted-markdown:V',
      observedAt: NOW,
      files: summarizeScanFiles(firstFiles),
    })

    // Visit two, after a full page reload: the note has grown by 300 words.
    const stored = loadScanSummaries(store)['mounted-markdown:V']
    const grown = [file('diary.md', `# Diary\n\nsome words here ${'word '.repeat(300)}`)]
    const events = normalizeMarkdownEvents({
      sourceId: 'mounted-markdown:V',
      companionId: 'pikachu-family',
      previous: stored.files,
      current: grown,
      now: NOW,
    })

    expect(events.filter((e) => e.category === 'new-words')).toHaveLength(3)
  })

  it('reports nothing new when the folder is unchanged across a reload', () => {
    const store = new InMemoryScanSummaryStore()
    const files = [file('a.md', '# A\n\nstable content')]
    saveScanSummary(store, {
      sourceId: 'mounted-markdown:V',
      observedAt: NOW,
      files: summarizeScanFiles(files),
    })

    const stored = loadScanSummaries(store)['mounted-markdown:V']
    const events = normalizeMarkdownEvents({
      sourceId: 'mounted-markdown:V',
      companionId: 'pikachu-family',
      previous: stored.files,
      current: files,
      now: NOW,
    })

    expect(events).toEqual([])
  })
})

describe('a corrupt or absent store degrades to a re-baseline', () => {
  it('returns an empty record for malformed json rather than throwing', () => {
    const store = new InMemoryScanSummaryStore()
    store.setItem(SCAN_SUMMARY_STORAGE_KEY, '{ not json')
    expect(loadScanSummaries(store)).toEqual({})
  })

  it('drops an entry that is missing required fields', () => {
    const store = new InMemoryScanSummaryStore()
    store.setItem(
      SCAN_SUMMARY_STORAGE_KEY,
      JSON.stringify({ a: { sourceId: 'a', observedAt: NOW, files: [{ path: 'x.md' }] } }),
    )
    expect(loadScanSummaries(store)).toEqual({})
  })

  it('treats an absent key as an empty record', () => {
    expect(loadScanSummaries(new InMemoryScanSummaryStore())).toEqual({})
  })

  it('evicts the least recently observed folder rather than growing without bound', () => {
    const store = new InMemoryScanSummaryStore()
    for (let i = 0; i < 12; i += 1) {
      saveScanSummary(store, {
        sourceId: `mounted-markdown:V${i}`,
        observedAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
        files: [],
      })
    }

    const all = loadScanSummaries(store)
    expect(Object.keys(all).length).toBe(8)
    // The newest survive, the oldest are gone.
    expect(all['mounted-markdown:V11']).toBeDefined()
    expect(all['mounted-markdown:V0']).toBeUndefined()
  })

  it('clears one folder without touching the others', () => {
    const store = new InMemoryScanSummaryStore()
    saveScanSummary(store, { sourceId: 'a', observedAt: NOW, files: [] })
    saveScanSummary(store, { sourceId: 'b', observedAt: NOW, files: [] })

    clearScanSummary(store, 'a')
    const all = loadScanSummaries(store)
    expect(all['a']).toBeUndefined()
    expect(all['b']).toBeDefined()
  })
})