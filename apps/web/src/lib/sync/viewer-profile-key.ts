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
