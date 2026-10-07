/**
 * The assignment bound is the product decision, so it is pinned here.
 *
 * The failure this guards against is not a crash: it is a bound that silently
 * stops binding. A companion spent twice, an assignment outliving the companion
 * it points at, or a profile that dresses more repositories than it owns all
 * still render, still typecheck, and still look correct on screen.
 */

import { describe, expect, it } from 'vitest'
import { createGuestProfile, type GuestProfile } from './guest-profile'
import {
  assignCompanion,
  assignableCompanions,
  assignmentForRepository,
  remainingAssignments,
  releaseRepository,
  pruneAssignments,
  checkAssignment,
  type RepoAssignment,
} from './repo-assignments'

const NOW = '2026-10-07T10:00:00.000Z'

/** A profile owning `count` companions, the first of which is the starter. */
function profileOwning(count: number): GuestProfile {
  const base = createGuestProfile({
    guestId: 'guest-1',
    starterCompanionId: 'pikachu-family',
    now: NOW,
  })
  const extra = Array.from({ length: count - 1 }, (_, i) => ({
    referenceId: `draw-${i}`,
    companionId: i % 2 === 0 ? 'ditto-like' : 'pikachu-family',
    acquiredAt: NOW,
    acquisition: 'encounter' as const,
  }))
  return { ...base, collection: [...base.collection, ...extra] }
}

/** Apply an assignment that is expected to succeed. */
function force(profile: GuestProfile, repo: string, ref: string): GuestProfile {
  const outcome = assignCompanion(profile, repo, ref, NOW)
  if (!outcome.ok) throw new Error(`expected ok, refused: ${outcome.reason}`)
  return outcome.profile
}

describe('the bound', () => {
  it('starts with every companion unassigned', () => {
    const p = profileOwning(3)
    expect(remainingAssignments(p)).toBe(3)
    expect(assignableCompanions(p).every((c) => c.assignable)).toBe(true)
  })

  it('allows exactly as many repositories as companions owned', () => {
    let p = profileOwning(2)
    p = force(p, 'repo-a', 'guest-1:starter')
    p = force(p, 'repo-b', 'draw-0')

    expect(remainingAssignments(p)).toBe(0)
    expect(assignableCompanions(p).every((c) => !c.assignable)).toBe(true)

    // The bound is enforced by each companion being spent exactly once: with
    // both spent there is nothing left to dress a third repository with.
    const third = assignCompanion(p, 'repo-c', 'draw-0', NOW)
    expect(third.ok).toBe(false)
    if (!third.ok) expect(third.reason).toBe('companion-already-spent')

    // And no third companion exists to try, so the count cannot grow.
    expect(p.collection).toHaveLength(2)
  })

  it('counts a duplicate species as its own companion', () => {
    // The display says "3 companions". If the bound counted distinct species it
    // would say 2, and the number on screen would be a lie.
    const p = profileOwning(3) // species: pikachu, ditto, pikachu
    expect(remainingAssignments(p)).toBe(3)
    expect(new Set(p.collection.map((c) => c.companionId)).size).toBe(2)
  })
})

describe('a companion is spent, not shared', () => {
  it('refuses to spend the same companion on a second repository', () => {
    const p = force(profileOwning(1), 'repo-a', 'guest-1:starter')
    const again = assignCompanion(p, 'repo-b', 'guest-1:starter', NOW)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.reason).toBe('companion-already-spent')
  })

  it('offers a spent companion as unassignable in the picker', () => {
    const p = force(profileOwning(2), 'repo-a', 'guest-1:starter')
    const options = assignableCompanions(p)
    expect(options.find((c) => c.referenceId === 'guest-1:starter')?.assignable).toBe(false)
    expect(options.find((c) => c.referenceId === 'draw-0')?.assignable).toBe(true)
  })

  it('frees the companion again once the repository is released', () => {
    let p = force(profileOwning(1), 'repo-a', 'guest-1:starter')
    p = releaseRepository(p, 'repo-a', NOW)
    expect(remainingAssignments(p)).toBe(1)
    expect(assignCompanion(p, 'repo-b', 'guest-1:starter', NOW).ok).toBe(true)
  })
})

describe('one companion per repository', () => {
  it('refuses a second companion on an already-dressed repository', () => {
    const p = force(profileOwning(2), 'repo-a', 'guest-1:starter')
    const again = assignCompanion(p, 'repo-a', 'draw-0', NOW)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.reason).toBe('repository-already-dressed')
  })

  it('reports the companion dressed on a repository', () => {
    const p = force(profileOwning(2), 'repo-a', 'draw-0')
    expect(assignmentForRepository(p, 'repo-a')?.referenceId).toBe('draw-0')
    expect(assignmentForRepository(p, 'repo-b')).toBeUndefined()
  })

  it('is a no-op when releasing a repository that was never dressed', () => {
    const p = profileOwning(1)
    expect(releaseRepository(p, 'repo-z', NOW)).toBe(p)
  })
})

describe('refusals name the actual problem', () => {
  it('rejects a companion the user does not own', () => {
    const p = profileOwning(1)
    expect(checkAssignment(p, 'repo-a', 'draw-99')).toBe('companion-not-owned')
    const outcome = assignCompanion(p, 'repo-a', 'draw-99', NOW)
    expect(outcome.ok).toBe(false)
  })

  it('leaves the profile untouched when it refuses', () => {
    const p = profileOwning(1)
    const outcome = assignCompanion(p, 'repo-a', 'nope', NOW)
    expect(outcome.ok).toBe(false)
    // Never partially applied: the original object comes back.
    expect(p.assignments).toEqual([])
  })
})

describe('pruning orphaned assignments', () => {
  it('drops an assignment whose companion left the collection', () => {
    const p = force(profileOwning(2), 'repo-a', 'draw-0')
    const trimmed: GuestProfile = {
      ...p,
      collection: p.collection.filter((c) => c.referenceId !== 'draw-0'),
    }
    const pruned = pruneAssignments(trimmed)
    expect(pruned.assignments).toEqual([])
  })

  it('drops a hand-edited profile that spends one companion twice', () => {
    // localStorage is user-writable, so this state is reachable without going
    // through assignCompanion at all.
    const p = profileOwning(2)
    const handEdited: GuestProfile = {
      ...p,
      assignments: [
        { repositoryId: 'a', referenceId: 'guest-1:starter', companionId: 'pikachu-family', assignedAt: NOW },
        { repositoryId: 'b', referenceId: 'guest-1:starter', companionId: 'pikachu-family', assignedAt: NOW },
      ] satisfies RepoAssignment[],
    }
    expect(pruneAssignments(handEdited).assignments).toHaveLength(1)
  })

  it('keeps the profile unchanged when nothing is orphaned', () => {
    const p = force(profileOwning(2), 'repo-a', 'guest-1:starter')
    expect(pruneAssignments(p)).toBe(p)
  })
})
