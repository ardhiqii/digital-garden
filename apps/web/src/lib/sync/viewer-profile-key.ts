/**
 * Which localStorage key holds a viewer's product profile.
 *
 * WHY THIS MODULE EXISTS: five surfaces read the profile, and they disagreed. When
 * a browser was signed in, `/github` read a per-account profile at
 * `terrarium:guest-profile:github-<id>` while `/write`, `/repos`, the navbar badge,
 * `/progression`, and (until this) `/companions` all read the bare
 * `terrarium:guest-profile`. Two pages then showed two different active companions,
 * two different collection sizes, and two different sets of eggs, and each page's
 * edits wrote somewhere the other never looked.
 *
 * WHY THE SERVER OWNS THE FORMAT: the client should not have to reconstruct the key
 * from a GitHub id it does not otherwise need. The session endpoint returns the
 * finished key, so the format lives in exactly one place and a change to it cannot
 * leave one surface behind.
 *
 * WHY THE ID AND NOT THE HANDLE: a handle can be renamed and its old value claimed
 * by someone else, so a profile keyed by handle would eventually hand one person's
 * companion to another.
 *
 * Pure and free of Node built-ins and of `window`, so a route handler and a client
 * hook can both import it.
 */

import { GUEST_PROFILE_STORAGE_KEY } from '../game/guest-profile'

/** The per-account profile key, or the guest key when nobody is signed in. */
export function profileKeyFor(githubId: number | null | undefined): string {
  return typeof githubId === 'number' && Number.isFinite(githubId)
    ? `${GUEST_PROFILE_STORAGE_KEY}:github-${githubId}`
    : GUEST_PROFILE_STORAGE_KEY
}

/** The profile key for an already-resolved namespace, or the guest key for none. */
export function profileKeyFromNamespace(namespace: string | undefined): string {
  return namespace ? `${GUEST_PROFILE_STORAGE_KEY}:${namespace}` : GUEST_PROFILE_STORAGE_KEY
}

/**
 * The namespace a profile key carries, or `undefined` for the signed-out key.
 *
 * The sibling product keys (ledger, encounters, revealed draws, sync schedule) are
 * namespaced by this value, NOT by the profile key: `product-browser-storage` builds
 * `${key}:${namespace}` itself, so passing a whole profile key through as the namespace
 * produces `terrarium:guest-encounters:terrarium:guest-profile:github-123`. That key is
 * read by nothing, so the state looks empty and the daily draw is handed out a second
 * time for the same day.
 *
 * Lives beside `profileKeyFor` because this is the inverse of that function, and the two
 * have to agree: `namespaceFromProfileKey(profileKeyFor(id))` is the id's namespace.
 */
export function namespaceFromProfileKey(profileKey: string): string | undefined {
  return profileKey === GUEST_PROFILE_STORAGE_KEY
    ? undefined
    : profileKey.slice(GUEST_PROFILE_STORAGE_KEY.length + 1)
}
