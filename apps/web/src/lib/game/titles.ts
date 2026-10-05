/**
 * Named ranks derived from total XP.
 *
 * WHY DERIVED, NOT STORED: a title is a pure function of accumulated XP, the
 * same way a stage is. Storing it would create a second source of truth that
 * can drift from the ledger, and the ledger is already the only thing XP is
 * trusted from. Nothing here is persisted, so nothing here can disagree with
 * the events.
 *
 * TITLES NEVER GO DOWN. XP only accumulates, so the mapping is monotonic by
 * construction (the table is ordered and the lookup takes the last threshold
 * reached). That is deliberate: a reward that a quiet week can take away is a
 * punishment, and PRODUCT.md rejects punishing engagement.
 *
 * TITLES ARE NOT STAGES. A stage is the creature's form; a title is the
 * person's standing. Conflating them would mean someone who never triggers an
 * encounter can never earn a title, which is wrong — titles track work, and
 * encounters are a separate, weighted lottery.
 *
 * Thresholds are playtest values, like the XP rates in `events.ts`. Tier 3 is
 * pinned to the `mossling` stage threshold (1,500) so the title ladder and the
 * stage ladder never tell contradictory stories at the same XP total.
 */

export type TitleId =
  | 'seedling'
  | 'sprout'
  | 'gardener'
  | 'botanist'
  | 'arborist'
  | 'curator'
  | 'archivist'
  | 'elderwood'

export interface Title {
  id: TitleId
  /** Display name, e.g. "Botanist". */
  name: string
  /** 1-indexed rank. */
  tier: number
  /** Cumulative XP at which this title begins. The first must be 0. */
  threshold: number
  /** One-line description of what the rank represents. */
  blurb: string
}

export const TITLES: readonly Title[] = [
  { id: 'seedling', name: 'Seedling', tier: 1, threshold: 0, blurb: 'Just arrived.' },
  { id: 'sprout', name: 'Sprout', tier: 2, threshold: 500, blurb: 'First real activity.' },
  { id: 'gardener', name: 'Gardener', tier: 3, threshold: 1500, blurb: 'A habit forming.' },
  { id: 'botanist', name: 'Botanist', tier: 4, threshold: 5000, blurb: 'Sustained work.' },
  { id: 'arborist', name: 'Arborist', tier: 5, threshold: 12000, blurb: 'A serious garden.' },
  { id: 'curator', name: 'Curator', tier: 6, threshold: 25000, blurb: 'A collection, not a plant.' },
  { id: 'archivist', name: 'Archivist', tier: 7, threshold: 50000, blurb: 'Deep history.' },
  { id: 'elderwood', name: 'Elderwood', tier: 8, threshold: 100000, blurb: 'The long haul.' },
] as const

export interface ResolvedTitle {
  title: Title
  nextTitle: Title | null
  /** XP earned inside the current tier. */
  xpIntoTier: number
  /** XP needed to leave the current tier, or null at the top. */
  xpForNextTier: number | null
  /** 0..1 progress toward the next tier; 1 at the top. */
  progress: number
}

/**
 * The title for a total XP value. Any non-finite or negative input resolves to
 * the first title rather than throwing: XP is derived from user data and a
 * corrupt value must not take a page down.
 */
export function resolveTitle(totalXp: number): ResolvedTitle {
  const xp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0

  let index = 0
  for (let i = 0; i < TITLES.length; i += 1) {
    if (xp >= TITLES[i].threshold) index = i
    else break
  }

  const title = TITLES[index]
  const nextTitle = TITLES[index + 1] ?? null

  if (!nextTitle) {
    return {
      title,
      nextTitle: null,
      xpIntoTier: xp - title.threshold,
      xpForNextTier: null,
      progress: 1,
    }
  }

  const xpForNextTier = nextTitle.threshold - title.threshold
  return {
    title,
    nextTitle,
    xpIntoTier: xp - title.threshold,
    xpForNextTier,
    progress: Math.min(1, Math.max(0, (xp - title.threshold) / xpForNextTier)),
  }
}
