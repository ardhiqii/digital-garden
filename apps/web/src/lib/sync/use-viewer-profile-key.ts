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

export interface ViewerSession {
  signedIn: boolean
  handle: string | null
  avatarUrl: string | null
  /** The finished localStorage key for this viewer. Always present. */
  profileKey: string
  configured: boolean
}

let inFlight: Promise<ViewerSession | null> | null = null

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
      return {
        signedIn: record.signedIn === true,
        handle: typeof record.handle === 'string' ? record.handle : null,
        avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : null,
        profileKey: record.profileKey,
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
