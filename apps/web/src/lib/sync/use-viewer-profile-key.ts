'use client'

/**
 * The storage key for the current viewer's product profile.
 *
 * WHY A HOOK AND NOT A CONSTANT: the key depends on who is signed in, which only the
 * server knows. Five surfaces read a profile and four of them hard-coded the
 * signed-out key, so a signed-in user saw one active companion on `/github` and a
 * different one everywhere else.
 *
 * WHY `null` MEANS "NOT YET KNOWN": the session arrives after the first paint (the
 * endpoint is deliberately uncached so it can never serve one visitor's identity to
 * another). A component that guessed the signed-out key before the answer arrived
 * would read the wrong profile for a moment and, worse, might write to it. Callers
 * must wait for a non-null key.
 *
 * WHY THE FETCH IS SHARED: the navbar badge, the picker, and the runtime can all be
 * on screen at once. A module-level promise means they make one request between
 * them rather than one each.
 */

import { useEffect, useState } from 'react'
import { GUEST_PROFILE_STORAGE_KEY, loadGuestProfile, saveGuestProfile } from '@/lib/game/guest-profile'
import { planGuestMigration } from '@/lib/game/guest-migration'

export interface ViewerSession {
  signedIn: boolean
  handle: string | null
  avatarUrl: string | null
  /** The finished localStorage key for this viewer. Always present. */
  profileKey: string
  configured: boolean
}

let inFlight: Promise<ViewerSession | null> | null = null

/**
 * Carry a signed-out profile into the account, once, before any surface reads it.
 *
 * WHY THIS RUNS HERE AND NOT IN A PAGE COMPONENT: the migration was first wired into
 * `/write` only, so signing in from the navbar while on `/github` never imported
 * anything. `/github` then called `ensureBrowserGuestProfile`, found nothing under the
 * account key, and created a fresh starter, while the real profile sat untouched under
 * the signed-out key. Landing on the wrong page decided whether a user kept their
 * companions.
 *
 * This hook already resolves the key on every page and shares one request, so doing the
 * import here means it runs once, from wherever the user lands, before any reader can
 * look in the wrong place.
 *
 * WHY IT IS IDEMPOTENT: the guest key is removed after a successful write, so the next
 * call finds nothing to import. A failed write leaves the guest key in place, which is
 * the safe direction: the next visit retries rather than losing the data.
 */
function migrateGuestProfileIntoAccount(profileKey: string): void {
  if (typeof window === 'undefined') return
  // Signed out: there is no account to import into, and clearing the guest key would
  // throw the user's progress away.
  if (profileKey === GUEST_PROFILE_STORAGE_KEY) return

  try {
    const storage = window.localStorage
    const guestProfile = loadGuestProfile(storage, GUEST_PROFILE_STORAGE_KEY)
    if (!guestProfile) return
    const accountProfile = loadGuestProfile(storage, profileKey)

    if (!accountProfile) {
      // PRODUCT.md 4.4: no server profile yet, so import the current companion
      // condition and collection. A straight copy under the account key, not a merge.
      saveGuestProfile(storage, guestProfile, profileKey)
    } else {
      const plan = planGuestMigration(guestProfile, accountProfile)
      if (!plan) return
      saveGuestProfile(storage, plan.profile, profileKey)
    }
    storage.removeItem(GUEST_PROFILE_STORAGE_KEY)
    // Tell every mounted surface to re-read, since the profile they hydrated from has
    // just been superseded.
    window.dispatchEvent(new Event('terrarium:guest-profile-updated'))
  } catch {
    // A failed import leaves the guest profile exactly where it was. Losing it to a
    // cleanup path would be worse than showing the account's copy for one visit.
  }
}

/** Fetch the session once per page load; later callers share the same promise. */
function fetchSession(): Promise<ViewerSession | null> {
  inFlight ??= (async () => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' })
      if (!response.ok) return null
      const body: unknown = await response.json()
      if (!body || typeof body !== 'object') return null
      const record = body as Record<string, unknown>
      if (typeof record.profileKey !== 'string' || record.profileKey.length === 0) return null
      const profileKey = record.profileKey
      // Before anyone is handed this key.
      migrateGuestProfileIntoAccount(profileKey)
      return {
        signedIn: record.signedIn === true,
        handle: typeof record.handle === 'string' ? record.handle : null,
        avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : null,
        profileKey,
        configured: record.configured === true,
      }
    } catch {
      // Offline or the endpoint is unreachable. No key is the honest answer; a
      // component falling back to the signed-out key could read the wrong profile.
      return null
    }
  })()
  return inFlight
}

/** Test seam: forget the cached request so a suite can stub a different session. */
export function resetViewerSessionForTests(): void {
  inFlight = null
}

/**
 * The viewer's profile key, or `null` until it is known.
 *
 * Waits for the answer rather than assuming, because writing to the wrong key is
 * silent data loss rather than a visible error.
 */
export function useViewerProfileKey(): string | null {
  const [key, setKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchSession().then((session) => {
      if (!cancelled && session) setKey(session.profileKey)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return key
}

/**
 * Resolve the viewer's key and run the guest import, outside React.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE HOOK: the import must happen on whichever page the
 * user lands on. Routing it through a component made it depend on that component being
 * mounted: the navbar badge is rendered inside the nav rows, and on a phone the nav row
 * holding it only exists once the hamburger menu is opened. A user signing in on a phone
 * would never have migrated.
 *
 * Called once from `AppShell`, which is mounted on every route.
 */
export function startViewerSession(): void {
  void fetchSession()
}

/**
 * The same request, awaitable.
 *
 * WHY A CALLER NEEDS THIS: `/github` hydrates with `ensureBrowserGuestProfile`, which
 * CREATES a profile when the account key is empty. Run against a key the import has not
 * written yet, it invents a fresh starter and the user's real companions are orphaned
 * under the signed-out key. Awaiting the session guarantees the import has finished
 * before anything is allowed to create a blank profile.
 *
 * Resolves to null when the session is unreachable; callers must still handle that
 * rather than assuming a key.
 */
export function ensureViewerSession(): Promise<ViewerSession | null> {
  return fetchSession()
}
