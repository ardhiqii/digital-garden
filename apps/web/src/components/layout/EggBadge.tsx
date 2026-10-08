'use client'

/**
 * A count of unopened eggs, so the inventory is discoverable.
 *
 * WHY THIS EXISTS: an egg the user never notices is the same as no egg. The
 * inventory lives on /companions, and nothing else in the app hints that something
 * is waiting there. Without a badge, a daily draw can sit unopened indefinitely and
 * the reward may as well not have happened.
 *
 * WHY IT READS STORAGE DIRECTLY RATHER THAN RECEIVING THE COUNT: the navbar is
 * rendered on the server for every route and knows nothing about the guest
 * profile, which lives in localStorage. A prop would have to be threaded from
 * every page. Reading in a client island and listening for the profile-updated
 * event keeps the count correct without the whole shell becoming client-side.
 */

import { useEffect, useState } from 'react'
import { loadGuestProfile } from '@/lib/game/guest-profile'
import { eggCount } from '@/lib/game/companion-eggs'
import { useViewerProfileKey } from '@/lib/sync/use-viewer-profile-key'

export function EggBadge() {
  const [count, setCount] = useState(0)
  const profileKey = useViewerProfileKey()

  useEffect(() => {
    // Wait for the key. Reading the signed-out profile on a signed-in browser showed
    // the wrong egg count, and the badge is the only thing telling the user an egg is
    // waiting at all.
    if (!profileKey) return
    const read = () => {
      try {
        const profile = loadGuestProfile(window.localStorage, profileKey)
        setCount(profile ? eggCount(profile) : 0)
      } catch {
        // Storage unavailable: no badge is the honest result.
        setCount(0)
      }
    }
    read()
    window.addEventListener('terrarium:guest-profile-updated', read)
    return () => window.removeEventListener('terrarium:guest-profile-updated', read)
  }, [profileKey])

  if (count === 0) return null

  return (
    <span
      className="font-data ml-1 inline-flex min-w-[1.1rem] items-center justify-center px-1 text-[10px] leading-4"
      style={{ background: 'var(--accent)', color: 'var(--paper)' }}
      aria-label={`${count} unopened ${count === 1 ? 'egg' : 'eggs'}`}
    >
      {count}
    </span>
  )
}
