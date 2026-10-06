/**
 * The one place a Markdown scan is announced to the product runtime.
 *
 * WHY A SHARED HELPER: the runtime listens for exactly one event name and one
 * payload shape (`MarkdownScanDetail`). Two callers need to raise it, and if
 * each built its own payload they would drift the first time either changed.
 * The scan happens when a folder is read on mount, and again after the editor
 * writes a note, so the two must be indistinguishable to the runtime.
 *
 * WHY THE EDITOR NOW RAISES IT: it did not, so `/write` had a real gap. A note
 * saved in the built-in editor produced no event, and the ledger only advances
 * on an event, so the XP for that note did not exist until the page was
 * reloaded. A user sitting on the page watching the counter had every reason to
 * conclude the feature was broken. Raising the scan on save closes that gap
 * without inventing a second code path: the note is simply re-read, and the
 * normalizer diffs it against the previous scan like any other change.
 *
 * CONTENT RULE: note text is passed in-process to the runtime, never over the
 * network. Nothing here uploads anything.
 */
import type { GardenFile, GardenSource } from './types'
import type { MarkdownFileSnapshot } from '../game/markdown-events'

/** The event name the product runtime listens for. */
export const MARKDOWN_SCAN_EVENT = 'terrarium:markdown-scan'

/**
 * The payload shape the runtime parses. Exported so both sides compile against
 * one definition rather than two structurally-identical interfaces.
 */
export interface MarkdownScanDetail {
  sourceId: string
  files: MarkdownFileSnapshot[]
}

/**
 * A folder's stable id for the product runtime.
 *
 * Note this is the folder NAME, which is why it must never be used as a cap
 * key: renaming a folder would mint a fresh daily allowance. Caps bucket by the
 * scan clock instead (see `markdown-events.ts`). The id is only an identity for
 * "which folder is this", not a budget.
 */
export function markdownSourceId(folderName: string): string {
  return `mounted-markdown:${folderName}`
}

/** Map a read folder into the snapshot the runtime diffs against. */
export function toMarkdownSnapshots(files: readonly GardenFile[]): MarkdownFileSnapshot[] {
  return files.map((file) => ({
    path: file.name,
    content: file.content,
    modifiedAt: new Date(file.lastModified ?? Date.now()).toISOString(),
  }))
}

/**
 * Raise a scan for an already-read folder.
 *
 * Separate from `dispatchMarkdownScan` so a caller that has just listed the
 * folder (the editor, after a write) does not list it a second time.
 */
export function dispatchMarkdownScanDetail(
  sourceName: string,
  files: readonly GardenFile[],
): void {
  const detail: MarkdownScanDetail = {
    sourceId: markdownSourceId(sourceName),
    files: toMarkdownSnapshots(files),
  }
  window.dispatchEvent(new CustomEvent(MARKDOWN_SCAN_EVENT, { detail }))
}

/**
 * Read a folder and raise a scan for it.
 *
 * Returns the files it read, so a caller that also needs them (to count notes,
 * or to render stats) does not pay for a second `list()`.
 */
export async function dispatchMarkdownScan(source: GardenSource): Promise<GardenFile[]> {
  const files = await source.list()
  dispatchMarkdownScanDetail(source.name, files)
  return files
}
