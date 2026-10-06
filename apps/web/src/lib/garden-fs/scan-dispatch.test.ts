/**
 * The scan dispatch is the single place the product runtime hears about a
 * folder, so these tests pin the contract both callers depend on: one event
 * name, one payload shape, and a source id that matches what the runtime
 * expects to see.
 *
 * The suite runs under the node environment (see vitest.config.mts), so there
 * is no `window`. It is stubbed rather than pulling in jsdom for one file,
 * matching how the rest of this repo fakes browser globals (vi.stubGlobal).
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  MARKDOWN_SCAN_EVENT,
  dispatchMarkdownScan,
  dispatchMarkdownScanDetail,
  markdownSourceId,
  toMarkdownSnapshots,
  type MarkdownScanDetail,
} from './scan-dispatch'
import type { GardenFile, GardenSource } from './types'

/** A minimal event target that records what was dispatched. */
function fakeWindow() {
  const listeners = new Map<string, Set<(event: Event) => void>>()
  const dispatched: Array<{ type: string; detail: unknown }> = []
  return {
    dispatched,
    addEventListener: (type: string, fn: (event: Event) => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(fn)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, fn: (event: Event) => void) => {
      listeners.get(type)?.delete(fn)
    },
    dispatchEvent: (event: Event) => {
      const custom = event as CustomEvent<unknown>
      dispatched.push({ type: event.type, detail: custom.detail })
      for (const fn of listeners.get(event.type) ?? []) fn(event)
      return true
    },
  }
}

class FakeCustomEvent<T> extends Event {
  readonly detail: T
  constructor(type: string, init: { detail: T }) {
    super(type)
    this.detail = init.detail
  }
}

function file(name: string, content = '# x\n'): GardenFile {
  return { name, content, lastModified: Date.parse('2026-10-01T10:00:00.000Z') }
}

function sourceOf(name: string, files: GardenFile[]): GardenSource {
  return {
    name,
    list: async () => files,
    read: async () => null,
    write: async () => {},
    remove: async () => {},
    rename: async () => {},
  }
}

function installFakeWindow() {
  const win = fakeWindow()
  vi.stubGlobal('window', win)
  vi.stubGlobal('CustomEvent', FakeCustomEvent)
  return win
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('markdownSourceId', () => {
  it('prefixes the folder so note events stay disjoint from github ones', () => {
    expect(markdownSourceId('MyVault')).toBe('mounted-markdown:MyVault')
  })
})

describe('toMarkdownSnapshots', () => {
  it('carries path and content through unchanged', () => {
    const [snapshot] = toMarkdownSnapshots([file('a.md', '# A\n\nbody')])
    expect(snapshot.path).toBe('a.md')
    expect(snapshot.content).toBe('# A\n\nbody')
  })

  it('converts lastModified milliseconds into an ISO timestamp', () => {
    const [snapshot] = toMarkdownSnapshots([file('a.md')])
    expect(snapshot.modifiedAt).toBe('2026-10-01T10:00:00.000Z')
  })

  it('falls back to now when the platform reports no mtime', () => {
    const before = Date.now()
    const [snapshot] = toMarkdownSnapshots([{ name: 'a.md', content: 'x' }])
    const parsed = Date.parse(snapshot.modifiedAt)
    expect(Number.isFinite(parsed)).toBe(true)
    expect(parsed).toBeGreaterThanOrEqual(before - 1000)
  })
})

describe('dispatchMarkdownScanDetail', () => {
  it('emits exactly one event, with the runtime payload shape', () => {
    const win = installFakeWindow()
    dispatchMarkdownScanDetail('MyVault', [file('a.md'), file('b.md')])

    expect(win.dispatched).toHaveLength(1)
    expect(win.dispatched[0].type).toBe(MARKDOWN_SCAN_EVENT)
    const detail = win.dispatched[0].detail as MarkdownScanDetail
    expect(detail.sourceId).toBe('mounted-markdown:MyVault')
    expect(detail.files.map((f) => f.path)).toEqual(['a.md', 'b.md'])
  })

  it('reaches a listener registered for the runtime event name', () => {
    const win = installFakeWindow()
    const seen: MarkdownScanDetail[] = []
    win.addEventListener(MARKDOWN_SCAN_EVENT, (event: Event) => {
      seen.push((event as CustomEvent<MarkdownScanDetail>).detail)
    })

    dispatchMarkdownScanDetail('Vault', [file('a.md')])

    expect(seen).toHaveLength(1)
    expect(seen[0].sourceId).toBe('mounted-markdown:Vault')
  })
})

describe('dispatchMarkdownScan', () => {
  it('reads the folder and returns the files it announced', async () => {
    const win = installFakeWindow()
    const files = [file('a.md'), file('b.md')]

    const returned = await dispatchMarkdownScan(sourceOf('Vault', files))

    // Returned, so a caller that also needs them does not list twice.
    expect(returned).toBe(files)
    expect(win.dispatched).toHaveLength(1)
    const detail = win.dispatched[0].detail as MarkdownScanDetail
    expect(detail.files).toHaveLength(2)
  })
})
