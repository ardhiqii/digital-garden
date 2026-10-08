/**
 * Every surface that reads a product profile must resolve the same storage key.
 *
 * WHY THIS IS A SOURCE TEST AND NOT A RUNTIME ONE: the failure mode is silent and
 * split. Five components read the profile, four of them hard-coded the signed-out key
 * and one used `github-<id>`, so a signed-in user saw one active companion on
 * `/github` and a different one everywhere else, with two different collection sizes
 * and two different sets of eggs. Nothing threw; the pages each looked correct on
 * their own. A runtime test would need a signed-in browser to notice, so the pairing
 * is pinned at the source instead, which is also what catches a sixth surface added
 * later.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// This file lives at src/lib/sync, so the web root is three levels up.
const WEB = path.join(__dirname, '..', '..', '..')

function read(relative: string): string {
  return readFileSync(path.join(WEB, relative), 'utf8')
}

/** Components that read the viewer's profile or product state from localStorage. */
const PROFILE_READERS: { file: string; why: string }[] = [
  { file: 'src/components/game/OwnedCompanionGrid.tsx', why: 'the owned collection on /companions' },
  { file: 'src/components/game/CompanionPicker.tsx', why: 'dressing a repository on /repos' },
  { file: 'src/components/game/ProgressionView.tsx', why: 'ranks and achievements on /progression' },
  { file: 'src/components/game/GuestProductRuntime.tsx', why: 'the activity panel on /write' },
  { file: 'src/components/layout/EggBadge.tsx', why: 'the unopened-egg count in the navbar' },
]

describe('one resolver for the viewer profile key', () => {
  it('every profile reader takes its key from the shared hook', () => {
    const missing = PROFILE_READERS.filter(
      ({ file }) => !read(file).includes('useViewerProfileKey'),
    ).map(({ file, why }) => `${file} (${why})`)

    expect(missing).toEqual([])
  })

  it('no profile reader assumes the signed-out key', () => {
    // The exact bug: `loadGuestProfile(window.localStorage)` with no key argument
    // reads the signed-out profile even on a signed-in browser.
    const offenders = PROFILE_READERS.filter(({ file }) =>
      /loadGuestProfile\((window\.)?localStorage\)/.test(read(file)),
    ).map(({ file }) => file)

    expect(offenders).toEqual([])
  })

  it('the key format lives in exactly one module', () => {
    // A second place that assembles `guest-profile:github-<id>` is a second place it
    // can drift, which is how the surfaces diverged in the first place.
    const format = /`\$\{?GUEST_PROFILE_STORAGE_KEY\}?:github-/
    const readers = PROFILE_READERS.filter(({ file }) => format.test(read(file))).map(({ file }) => file)
    expect(readers).toEqual([])

    expect(read('src/lib/sync/viewer-profile-key.ts')).toContain('github-')
  })

  it('the session endpoint returns the assembled key, not the raw id', () => {
    const source = read('src/app/api/auth/session/route.ts')
    expect(source).toContain('profileKey')
    expect(source).toContain('profileKeyFor')
    // The numeric id is what the key is built from server-side; exposing it would
    // invite a client to rebuild the key and re-introduce the split.
    expect(source).not.toMatch(/githubId:\s*session\.githubId/)
  })

  it('every effect that waits for the key also re-runs when it arrives', () => {
    // THE BUG THIS CATCHES, which shipped in the first version of this fix: the effect
    // body began with `if (!profileKey) return`, but the dependency array was still
    // `[]`. The effect ran once before the key was known, returned immediately, and
    // never ran again, so the daily draw was never claimed and no egg was ever laid.
    // Every page rendered correctly while doing nothing.
    const offenders = PROFILE_READERS.filter(({ file }) => {
      const source = read(file)
      if (!source.includes('if (!profileKey) return')) return false
      // Find the dependency arrays and require at least one to name profileKey.
      const deps = [...source.matchAll(/\},\s*\[([^\]]*)\]\)/g)].map((m) => m[1])
      return !deps.some((d) => d.includes('profileKey'))
    }).map(({ file }) => file)

    expect(offenders).toEqual([])
  })

  it('the import is started from a component mounted on every route', () => {
    // THE SECOND BUG, found by asking which page the import actually ran on: it was
    // wired into /write only, and then into the egg badge, which on a phone lives inside
    // the hamburger menu. Landing on /github, or signing in on a phone, migrated nothing.
    const navbar = read('src/components/layout/Navbar.tsx')
    expect(navbar).toContain('startViewerSession')

    // And it must not depend on a viewport-specific row: the call has to sit in the
    // component's own effect, not inside the `hidden sm:flex` or `sm:hidden` nav rows.
    const effect = navbar.slice(navbar.indexOf('useEffect('), navbar.indexOf('const NAV_LINKS'))
    expect(effect).toContain('startViewerSession')
  })

  it('/github waits for the import before it may create a profile', () => {
    // `ensureBrowserGuestProfile` INVENTS a fresh starter when the account key is empty.
    // Racing the import orphaned the user's real companions under the signed-out key and
    // showed them a blank one.
    const panel = read('src/components/game/GitHubSourcePanel.tsx')
    expect(panel).toContain('ensureViewerSession')

    const waitAt = panel.indexOf('await ensureViewerSession()')
    const createAt = panel.indexOf('const localState = browserState(namespace)')
    expect(waitAt).toBeGreaterThan(-1)
    expect(createAt).toBeGreaterThan(-1)
    expect(waitAt).toBeLessThan(createAt)
  })
})
