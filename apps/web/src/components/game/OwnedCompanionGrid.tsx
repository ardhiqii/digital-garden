'use client'

/**
 * The companions the user actually owns.
 *
 * WHY THIS REPLACED THE REPO GRID ON /companions: that page rendered one
 * generated creature per GitHub repository and titled the section "Garden
 * collection". A user with 24 repositories saw 24 tiles under a heading that said
 * "collection" and reasonably concluded they already owned 24 companions. They
 * owned one. The repo creatures are real, but they are a view of the repository
 * archive, not the user's collection, and calling both "collection" is what made
 * a working feature look like a bug.
 *
 * WHY THE OWNED COMPANIONS ARE READ FROM BROWSER STORAGE: /companions is a Server
 * Component, and the guest collection lives in localStorage. There is no server
 * copy for a guest, by design (PRODUCT.md 4.2). So this is a client island inside
 * the server page, and it renders nothing until it has read storage, rather than
 * guessing at a server-rendered empty state that would flash "0 companions" at a
 * user who owns several.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { loadGuestProfile, type GuestProfile } from '@/lib/game/guest-profile'
import { PROTOTYPE_COMPANION_CATALOG } from '@/lib/game/companion-catalog'
import { assignments, remainingAssignments } from '@/lib/game/repo-assignments'

export interface OwnedCompanionGridProps {
  /**
   * The stage sprite, rendered on the SERVER and passed in.
   *
   * WHY NOT IMPORT IT HERE: this is a `'use client'` component, and
   * `CreatureSprite` transitively imports `node:fs` through the sprite source
   * layer. Turbopack fails the entire build on one such module, taking down every
   * route rather than just this page, and `client-bundle-safety.test.ts` fails
   * first to say so. Importing a sprite here would break the whole app; receiving
   * one as a prop keeps the client bundle free of Node built-ins.
   *
   * One node is enough because every tile shows the same freshly-acquired stage.
   */
  sprite: ReactNode
}

/** One tile per owned companion. Duplicates are listed, because they are real. */
function useOwnedCompanions(): { profile: GuestProfile | null; ready: boolean } {
  const [profile, setProfile] = useState<GuestProfile | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const read = () => {
      try {
        setProfile(loadGuestProfile(window.localStorage))
      } catch {
        // Storage can be unavailable (private mode, disabled cookies). An empty
        // list is the honest result; the page still explains what a companion is.
        setProfile(null)
      }
      setReady(true)
    }
    read()
    window.addEventListener('terrarium:guest-profile-updated', read)
    return () => window.removeEventListener('terrarium:guest-profile-updated', read)
  }, [])

  return { profile, ready }
}

export function OwnedCompanionGrid({ sprite }: OwnedCompanionGridProps) {
  const { profile, ready } = useOwnedCompanions()

  if (!ready) {
    // Deliberately not an empty state: claiming "no companions" before storage
    // has been read would be wrong for everyone who owns one.
    return null
  }

  const collection = profile?.collection ?? []
  const dressed = assignments(profile ?? ({} as GuestProfile))
  const remaining = profile ? remainingAssignments(profile) : 0

  if (collection.length === 0) {
    return (
      <p className="font-prose text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        No companion yet. One is granted when you first arrive, and another every
        day you come back.
      </p>
    )
  }

  return (
    <>
      <p
        className="font-data text-xs uppercase tracking-widest mb-4"
        style={{ color: 'var(--ink-muted)' }}
      >
        {collection.length} {collection.length === 1 ? 'companion' : 'companions'}
        {remaining > 0
          ? ` · ${remaining} free to dress a repository`
          : collection.length > 0
            ? ' · all dressing a repository'
            : ''}
      </p>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {collection.map((entry) => {
          const definition = PROTOTYPE_COMPANION_CATALOG.get(entry.companionId)
          const assignment = dressed.find((a) => a.referenceId === entry.referenceId)
          return (
            <li
              key={entry.referenceId}
              className="border p-3"
              style={{ borderColor: 'var(--rule)', background: 'var(--paper-raised)' }}
            >
              <div className="mb-2">
                {/* Rendered on the server and handed in; see the prop's comment
                    for why this component must not import a sprite itself. */}
                {sprite}
              </div>
              <p className="font-ui text-sm font-medium">{definition?.name ?? entry.companionId}</p>
              <p className="font-data mt-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                {entry.acquisition === 'starter' ? 'your first' : entry.acquisition}
              </p>
              {assignment ? (
                <p className="font-data mt-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                  dressing a repository
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}
