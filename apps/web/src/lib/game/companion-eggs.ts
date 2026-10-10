/**
 * Companions arrive as eggs, and hatch when the user chooses to open them.
 *
 * WHY THIS EXISTS: a draw used to land straight in the collection and announce
 * itself in a panel at the top of the page. The user never saw a moment of
 * acquisition; they read a line of text about it. An egg that has to be opened is
 * the same event with the user present for it.
 *
 * WHY THE EGG IS A STORED OBJECT AND NOT DERIVED FROM `encounters.draws`: a draw is
 * a record of the roll, and an egg is an object with its own lifecycle (it is in
 * the inventory, it is being opened, it is gone). Deriving eggs from draws would
 * mean every future change to draws silently changes the inventory. The explicit
 * list is the smaller surface.
 *
 * WHY AN EGG IS NOT IN THE COLLECTION YET: the collection is what the user owns,
 * and the assignment bound reads it. A companion nobody has met yet cannot dress
 * a repository. Moving it on hatch keeps the displayed count, the bound, and the
 * user's own understanding of what they have in agreement.
 *
 * WHY DUPLICATES NEVER BECOME EGGS: a duplicate draw is converted to Essence at
 * draw time, and there is nothing inside the egg to reveal. An egg that opened onto
 * "you already had this" would be a reward that punishes.
 *
 * Pure and storage-free: every function takes a profile and returns a new one.
 */

import type { GuestProfile } from './guest-profile'
import type { PersistedEncounterDraw } from './encounters'

/** An unopened companion. `drawId` becomes the collection's `referenceId` on hatch. */
export interface PendingEgg {
  /** The draw that produced it. Becomes `referenceId` when it hatches. */
  drawId: string
  /** Catalog id, so the egg can be drawn in its species' colours. */
  companionId: string
  /** When the draw happened. */
  laidAt: string
}

/** Every egg waiting to be opened, oldest first. */
export function pendingEggs(profile: GuestProfile): readonly PendingEgg[] {
  return profile.eggs ?? []
}

/** How many eggs are waiting. Drives the navbar badge. */
export function eggCount(profile: GuestProfile): number {
  return pendingEggs(profile).length
}

/**
 * The draw ids currently sitting as eggs.
 *
 * Exposed as a set so the reveal card can ask "is this draw still an egg?" without
 * importing the whole inventory shape. A draw in this set is NOT in the collection:
 * it becomes a collection entry only when its egg is opened.
 */
export function eggDrawIds(profile: GuestProfile): ReadonlySet<string> {
  return new Set(pendingEggs(profile).map((egg) => egg.drawId))
}

/**
 * Turn new draws into eggs.
 *
 * Duplicates are skipped: they were already banked as Essence by
 * `advanceEncounter`, so an egg for one would open onto nothing.
 */
export function layEggs(
  profile: GuestProfile,
  newDraws: readonly PersistedEncounterDraw[],
  now: string,
): GuestProfile {
  const fresh = newDraws.filter((draw) => !draw.isDuplicate)
  if (fresh.length === 0) return profile

  // A draw id is stable, so re-laying the same draw is a no-op rather than a
  // second egg for one roll.
  const existing = new Set(pendingEggs(profile).map((egg) => egg.drawId))
  const laid: PendingEgg[] = fresh
    .filter((draw) => !existing.has(draw.id))
    .map((draw) => ({
      drawId: draw.id,
      companionId: draw.selectedCompanionId,
      laidAt: now,
    }))

  if (laid.length === 0) return profile
  return { ...profile, updatedAt: now, eggs: [...pendingEggs(profile), ...laid] }
}

export type HatchRefusal = 'egg-not-found' | 'already-hatched'

export type HatchOutcome =
  | { ok: true; profile: GuestProfile; hatched: PendingEgg }
  | { ok: false; reason: HatchRefusal }

/**
 * Open one egg: it leaves the inventory and its companion joins the collection.
 *
 * The collection entry keys on `drawId`, so the identity of a companion is the
 * same before and after hatching, and anything that referenced it (a repository
 * assignment, the active companion) keeps pointing at the same thing.
 *
 * Never throws and never partially applies: a refusal returns the original
 * profile, so a double-tap cannot hatch one egg into two entries.
 */
export function hatchEgg(
  profile: GuestProfile,
  drawId: string,
  now: string,
): HatchOutcome {
  const egg = pendingEggs(profile).find((candidate) => candidate.drawId === drawId)
  if (!egg) {
    const alreadyOwned = profile.collection.some((entry) => entry.referenceId === drawId)
    return { ok: false, reason: alreadyOwned ? 'already-hatched' : 'egg-not-found' }
  }

  const withoutEgg: GuestProfile = {
    ...profile,
    updatedAt: now,
    eggs: pendingEggs(profile).filter((candidate) => candidate.drawId !== drawId),
    collection: [
      ...profile.collection,
      {
        referenceId: egg.drawId,
        companionId: egg.companionId,
        acquiredAt: now,
        acquisition: 'encounter',
      },
    ],
  }

  return { ok: true, profile: withoutEgg, hatched: egg }
}

/**
 * Hatch every waiting egg at once.
 *
 * The animation is per-egg, but the state change is one write: hatching five eggs
 * should not be five chances for storage to fail halfway and leave the inventory
 * out of step with the collection.
 */
export function hatchAllEggs(profile: GuestProfile, now: string): GuestProfile {
  const eggs = pendingEggs(profile)
  if (eggs.length === 0) return profile

  return {
    ...profile,
    updatedAt: now,
    eggs: [],
    collection: [
      ...profile.collection,
      ...eggs.map((egg) => ({
        referenceId: egg.drawId,
        companionId: egg.companionId,
        acquiredAt: now,
        acquisition: 'encounter' as const,
      })),
    ],
  }
}

/**
 * Drop eggs whose companion is already in the collection.
 *
 * Reachable from a hand-edited profile, or from a restore that replaced the
 * profile between the lay and the hatch. Left alone, the same draw would be both
 * an egg and an owned companion, and hatching it would add a second entry for one
 * roll.
 */
export function pruneEggs(profile: GuestProfile): GuestProfile {
  const owned = new Set(profile.collection.map((entry) => entry.referenceId))
  const seen = new Set<string>()
  const kept = pendingEggs(profile).filter((egg) => {
    if (owned.has(egg.drawId)) return false
    if (seen.has(egg.drawId)) return false
    seen.add(egg.drawId)
    return true
  })
  if (kept.length === pendingEggs(profile).length) return profile
  return { ...profile, eggs: kept }
}
