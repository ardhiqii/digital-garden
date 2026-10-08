'use client'

/**
 * The companions the user actually owns, and the eggs still waiting to be opened.
 *
 * WHY THIS REPLACED THE REPO GRID ON /companions: that page rendered one
 * generated creature per GitHub repository and titled the section "Garden
 * collection". A user with 24 repositories saw 24 tiles under a heading that said
 * "collection" and reasonably concluded they already owned 24 companions. They
 * owned one. The repo creatures are real, but they are a view of the repository
 * archive, not the user's collection, and calling both "collection" is what made
 * a working feature look like a bug.
 *
 * WHY THE INVENTORY IS A SEPARATE BLOCK FROM THE COLLECTION: an egg is a thing to
 * open, not a companion. Merging the two counts would put "5 companions" above
 * four companions and one egg, and the user would have no way to tell that
 * something was still waiting for them.
 *
 * WHY THE OWNED COMPANIONS ARE READ FROM BROWSER STORAGE: /companions is a Server
 * Component, and the guest collection lives in localStorage. There is no server
 * copy for a guest, by design (PRODUCT.md 4.2). So this is a client island inside
 * the server page, and it renders nothing until it has read storage, rather than
 * guessing at a server-rendered empty state that would flash "0 companions" at a
 * user who owns several.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { loadGuestProfile, saveGuestProfile, type GuestProfile } from '@/lib/game/guest-profile'
import { PROTOTYPE_COMPANION_CATALOG } from '@/lib/game/companion-catalog'
import { assignments, remainingAssignments } from '@/lib/game/repo-assignments'
import { hatchEgg, pendingEggs } from '@/lib/game/companion-eggs'
import { useViewerProfileKey } from '@/lib/sync/use-viewer-profile-key'
import { EggHatch } from '@/components/game/EggHatch'

export interface OwnedCompanionGridProps {
  /**
   * The stage sprite for an owned companion, rendered on the SERVER and passed in.
   *
   * WHY NOT IMPORT IT HERE: this is a `'use client'` component, and
   * `CreatureSprite` transitively imports `node:fs` through the sprite source
   * layer. Turbopack fails the entire build on one such module, taking down every
   * route rather than just this page, and `client-bundle-safety.test.ts` fails
   * first to say so. Importing a sprite here would break the whole app; receiving
   * one as a prop keeps the client bundle free of Node built-ins.
   */
  sprite: ReactNode
  /** The unopened-egg shell, also server-rendered, for the same reason. */
  eggSprite: ReactNode
}

/** How many times the reveal has been asked for, keyed by egg. */
type HatchPhase = 'closed' | 'opening'

/** One unopened egg. Holds only the local "am I opening" state. */
function EggTile({
  eggSprite,
  companionId,
  onHatched,
}: {
  eggSprite: ReactNode
  companionId: string
  onHatched: () => void
}) {
  const [phase, setPhase] = useState<HatchPhase>('closed')
  const definition = PROTOTYPE_COMPANION_CATALOG.get(companionId)

  if (phase === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setPhase('opening')}
        aria-label="Open this egg"
        className="transition-transform hover:scale-105"
      >
        {eggSprite}
      </button>
    )
  }

  return (
    <EggHatch
      companionId={companionId}
      companionName={definition?.name ?? companionId}
      onHatched={onHatched}
    />
  )
}

export function OwnedCompanionGrid({ sprite, eggSprite }: OwnedCompanionGridProps) {
  const [profile, setProfile] = useState<GuestProfile | null>(null)
  const [ready, setReady] = useState(false)
  const profileKey = useViewerProfileKey()

  const read = useCallback(() => {
    // Wait for the key rather than assuming the signed-out one: on a signed-in
    // browser that assumption read a different profile from /github, which is how
    // this page and the GitHub panel came to show different active companions.
    if (!profileKey) return
    try {
      setProfile(loadGuestProfile(window.localStorage, profileKey))
    } catch {
      // Storage can be unavailable (private mode, disabled cookies). An empty
      // list is the honest result; the page still explains what a companion is.
      setProfile(null)
    }
    setReady(true)
  }, [profileKey])

  useEffect(() => {
    read()
    window.addEventListener('terrarium:guest-profile-updated', read)
    return () => window.removeEventListener('terrarium:guest-profile-updated', read)
  }, [read])

  const openEgg = useCallback(
    (drawId: string) => {
      setProfile((current) => {
        if (!current || !profileKey) return current
        const outcome = hatchEgg(current, drawId, new Date().toISOString())
        if (!outcome.ok) return current
        saveGuestProfile(window.localStorage, outcome.profile, profileKey)
        // Tells the navbar badge and the runtime that the inventory changed.
        window.dispatchEvent(new Event('terrarium:guest-profile-updated'))
        return outcome.profile
      })
    },
    [profileKey],
  )

  const makeActive = useCallback(
    (companionId: string) => {
      setProfile((current) => {
        if (!current || !profileKey) return current
        // The active companion is a field on the profile, not a separate store, so
        // this is a plain profile edit. `switchActiveCompanion` on ProductState is
        // the engine's own guard; here the profile is the only thing being changed
        // and the guard is the ownership check below.
        if (!current.collection.some((entry) => entry.companionId === companionId)) return current
        const next: GuestProfile = {
          ...current,
          activeCompanionId: companionId,
          updatedAt: new Date().toISOString(),
        }
        saveGuestProfile(window.localStorage, next, profileKey)
        window.dispatchEvent(new Event('terrarium:guest-profile-updated'))
        return next
      })
    },
    [profileKey],
  )

  if (!ready) {
    // Deliberately not an empty state: claiming "no companions" before storage
    // has been read would be wrong for everyone who owns one.
    return null
  }

  const collection = profile?.collection ?? []
  const eggs = profile ? pendingEggs(profile) : []
  const dressed = profile ? assignments(profile) : []
  const remaining = profile ? remainingAssignments(profile) : 0

  return (
    <>
      {eggs.length > 0 && (
        <div className="mb-10">
          <p
            className="font-data text-xs uppercase tracking-widest mb-3"
            style={{ color: 'var(--accent)' }}
          >
            {eggs.length} {eggs.length === 1 ? 'egg' : 'eggs'} waiting
          </p>
          <ul className="flex flex-wrap gap-4">
            {eggs.map((egg) => (
              <li
                key={egg.drawId}
                className="border p-4"
                style={{ borderColor: 'var(--accent)', background: 'var(--paper-raised)' }}
              >
                <EggTile
                  eggSprite={eggSprite}
                  companionId={egg.companionId}
                  onHatched={() => openEgg(egg.drawId)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {collection.length === 0 ? (
        <p className="font-prose text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          No companion yet. One is granted when you first arrive, and another every
          day you come back.
        </p>
      ) : (
        <>
          <p
            className="font-data text-xs uppercase tracking-widest mb-4"
            style={{ color: 'var(--ink-muted)' }}
          >
            {collection.length} {collection.length === 1 ? 'companion' : 'companions'}
            {remaining > 0
              ? ` · ${remaining} free to dress a repository`
              : ' · all dressing a repository'}
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {collection.map((entry) => {
              const definition = PROTOTYPE_COMPANION_CATALOG.get(entry.companionId)
              const assignment = dressed.find((a) => a.referenceId === entry.referenceId)
              const isActive = entry.companionId === profile?.activeCompanionId
              return (
                <li
                  key={entry.referenceId}
                  className="border p-3"
                  style={{ borderColor: 'var(--rule)', background: 'var(--paper-raised)' }}
                >
                  <div className="mb-2">{sprite}</div>
                  <p className="font-ui text-sm font-medium">
                    {definition?.name ?? entry.companionId}
                  </p>
                  <p
                    className="font-data mt-1 text-[10px] uppercase tracking-wider"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    {entry.acquisition === 'starter' ? 'your first' : entry.acquisition}
                  </p>
                  {assignment ? (
                    <p
                      className="font-data mt-1 text-[10px] uppercase tracking-wider"
                      style={{ color: 'var(--accent)' }}
                    >
                      dressing a repository
                    </p>
                  ) : null}
                  {/*
                    The page that LISTS the companions has to be the page that sets
                    which one is active. The control existed but was only mounted on
                    /write and /github, so the one screen where a user goes to think
                    about their companions was the one screen that could not change
                    the answer.
                  */}
                  {isActive ? (
                    <p
                      className="font-data mt-1 text-[10px] uppercase tracking-wider"
                      style={{ color: 'var(--accent)' }}
                    >
                      active
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makeActive(entry.companionId)}
                      className="ui-row font-data mt-2 px-2 py-1 text-[10px] uppercase tracking-wider border transition-opacity hover:opacity-80"
                      style={{ borderColor: 'var(--rule)', color: 'var(--ink)' }}
                    >
                      Make active
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
