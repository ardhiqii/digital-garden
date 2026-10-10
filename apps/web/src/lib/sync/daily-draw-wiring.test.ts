/**
 * The daily draw has to fire wherever the user lands.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT: the reward for "coming back every day" lived in
 * `GuestProductRuntime`, which is mounted on exactly one route. Nothing failed. The app
 * typechecked, the suite was green, the build passed, and the feature worked perfectly
 * for anyone who happened to open the editor. A user who landed on `/companions` — the
 * page that lists the eggs — got no egg, no badge, and no profile at all.
 *
 * This is the same defect the guest import had before it moved to the shared resolver,
 * so the guard is the same shape: name the exact user action that reaches the feature,
 * and pin WHICH component runs it.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const WEB = path.join(__dirname, '..', '..', '..')

function read(relative: string): string {
  return readFileSync(path.join(WEB, relative), 'utf8')
}

const RESOLVER = 'src/lib/sync/use-viewer-profile-key.ts'
const RUNTIME = 'src/components/game/GuestProductRuntime.tsx'

describe('the daily draw is claimed from a component mounted on every route', () => {
  it('is claimed in the shared session resolver', () => {
    const resolver = read(RESOLVER)
    expect(resolver).toContain('ensureViewerHasProfileAndDailyDraw')
    expect(resolver).toContain('claimDailyDraw')
    expect(resolver).toContain('isDailyDrawDue')
  })

  it('is called from the session fetch, not from a page-level effect', () => {
    // The resolver runs because the navbar calls `startViewerSession` on every route.
    // If the call moves out of the fetch path, it stops being route-independent and the
    // whole bug returns silently.
    const resolver = read(RESOLVER)
    const fetchBody = resolver.slice(resolver.indexOf('const profileKey = record.profileKey'))
    expect(fetchBody).toContain('ensureViewerHasProfileAndDailyDraw(profileKey)')
    expect(read('src/components/layout/Navbar.tsx')).toContain('startViewerSession()')
  })

  it('is no longer claimed by the /write-only runtime', () => {
    // The exact wiring that caused the bug. Leaving a second claim site is how the two
    // drift; the trigger-id gate makes a replay harmless, but one owner is the point.
    const runtime = read(RUNTIME)
    expect(runtime).not.toContain('claimDailyDraw(')
    expect(runtime).not.toContain('isDailyDrawDue(')
  })

  it('does NOT skip a signed-out visitor', () => {
    // A guard copied from the migration would do exactly the wrong thing here: the guest
    // key IS the signed-out key, so skipping it would skip the default case — the only
    // case that matters for a user who has not signed in yet.
    const resolver = read(RESOLVER)
    const fn = resolver.slice(
      resolver.indexOf('function ensureViewerHasProfileAndDailyDraw'),
      resolver.indexOf('function migrateEncounterStateIntoAccount'),
    )
    expect(fn).not.toMatch(/profileKey === GUEST_PROFILE_STORAGE_KEY/)
    // And it must ask the key module for the namespace, which returns undefined for the
    // guest key — the correct namespace for a signed-out profile.
    expect(fn).toContain('namespaceFromProfileKey(profileKey)')
  })

  it('claims AFTER the guest import, so a signed-in user gets one egg and not two', () => {
    // A guest who already claimed today and then signs in has their encounter state moved
    // into the account. Claiming before that move would see an empty state, find today
    // unclaimed, and hand out a second egg.
    const resolver = read(RESOLVER)
    const fetchBody = resolver.slice(resolver.indexOf('const profileKey = record.profileKey'))
    expect(fetchBody.indexOf('migrateGuestProfileIntoAccount(profileKey)')).toBeLessThan(
      fetchBody.indexOf('ensureViewerHasProfileAndDailyDraw(profileKey)'),
    )
  })

  it('creates the profile, or /companions has nothing to render at all', () => {
    const fn = read(RESOLVER)
    expect(fn).toContain('ensureBrowserGuestProfile')
    // `loadGuestProfile` alone returns null on a fresh browser, which is why the
    // read-only surfaces showed an empty page instead of a starter.
    expect(fn).not.toMatch(/const profile = loadGuestProfile\(/)
  })

  it('lays an egg rather than writing a collection entry', () => {
    // An unhatched companion must not count toward the assignment bound, so the draw has
    // to arrive as an egg on every path that can produce one.
    expect(read(RESOLVER)).toContain('layEggs(')
  })

  it('tells mounted surfaces, or the badge misses it until the next reload', () => {
    const fn = read(RESOLVER)
    expect(fn).toContain("new Event('terrarium:guest-profile-updated')")
  })

  it('survives a browser that refuses storage', () => {
    // The resolver runs from the navbar, so an uncaught throw here takes down every page.
    const resolver = read(RESOLVER)
    const fn = resolver.slice(
      resolver.indexOf('function ensureViewerHasProfileAndDailyDraw'),
      resolver.indexOf('function migrateEncounterStateIntoAccount'),
    )
    expect(fn).toMatch(/try \{[\s\S]*\} catch \{/)
  })
})
