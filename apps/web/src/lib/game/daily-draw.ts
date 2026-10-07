/**
 * One companion draw per day, for showing up.
 *
 * WHY THIS IS NOT A NEW PERSISTED FIELD: `EncounterState.processedTriggerIds`
 * already records every trigger that has been applied, and `advanceEncounter`
 * already refuses to apply one twice. A trigger id of `daily:<YYYY-MM-DD>` is
 * therefore its own record of "this day was claimed". Adding a `lastDailyDrawDay`
 * field would be a second source of truth for the same fact, and the two could
 * disagree after a partial write.
 *
 * WHY THE DRAW IS A TRIGGER RATHER THAN A SECOND DRAW PATH: the weighting, the
 * duplicate-to-Essence conversion, the sequence numbering, and the persisted
 * draw id all live in `advanceEncounter`. A parallel implementation would drift
 * from it, and the drift would show up as draws that behave differently
 * depending on which path produced them.
 *
 * WHY `progress: threshold` YIELDS EXACTLY ONE DRAW: the persisted meter is
 * always in `[0, threshold)`, so `meter + threshold` is in
 * `[threshold, 2*threshold)` and `floor(... / threshold)` is always 1. A claim
 * cannot bank draws by being claimed late, and cannot be starved by a meter
 * that happens to be high.
 *
 * WHY THE DAY IS LOCAL: PRODUCT.md already notes that UTC bucketing is wrong for
 * users east of UTC, and "log in daily" means the user's own day. A user in
 * UTC+7 gets a new draw at their own midnight, not at 7am.
 */

import {
  DEFAULT_ENCOUNTER_CONFIG,
  advanceEncounter,
  type EncounterAdvanceResult,
  type EncounterConfig,
  type EncounterState,
} from './encounters'
import type { CompanionCatalog } from './companion-catalog'

/**
 * The calendar day a moment falls on, in the user's local time.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that is UTC, so a user in UTC+7
 * would see their draw reset at 7am rather than midnight.
 */
export function localDay(now: Date): string {
  const year = now.getFullYear()
  // getMonth() is zero-based; the month in the id must be the human one.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The trigger id that claims one day. One per calendar day, by construction. */
export function dailyTriggerId(day: string): string {
  return `daily:${day}`
}

/**
 * Whether today's draw is still unclaimed.
 *
 * Read-only, so a UI can show the prompt without mutating anything.
 */
export function isDailyDrawDue(encounters: EncounterState, now: Date): boolean {
  return !encounters.processedTriggerIds.includes(dailyTriggerId(localDay(now)))
}

export interface ClaimResult extends EncounterAdvanceResult {
  /** False when the day was already claimed, making the call a no-op. */
  claimed: boolean
}

/**
 * Claim today's draw, if it has not been claimed yet.
 *
 * `ownedCompanionIds` is required rather than optional: the duplicate check that
 * decides whether a draw becomes a new companion or a handful of Essence lives
 * in `advanceEncounter`, and it reads this list. Passing an empty list would make
 * every draw look new, so the user would collect endless duplicates of the same
 * two species instead of Essence.
 *
 * Never throws and never partially applies: a day already claimed returns the
 * encounter state unchanged with `claimed: false`, so a replayed claim (a second
 * tab, a refresh, a restored backup) cannot produce a second companion.
 */
export function claimDailyDraw(
  encounters: EncounterState,
  now: Date,
  catalog: CompanionCatalog,
  ownedCompanionIds: readonly string[],
  config: EncounterConfig = DEFAULT_ENCOUNTER_CONFIG,
): ClaimResult {
  const id = dailyTriggerId(localDay(now))

  // advanceEncounter would also refuse the replay, but checking here keeps the
  // caller from having to interpret `ignored` to know whether anything happened.
  if (encounters.processedTriggerIds.includes(id)) {
    return { state: encounters, newDraws: [], ignored: true, claimed: false }
  }

  const result = advanceEncounter(
    encounters,
    {
      id,
      // Exactly one draw; see the note at the top of the file.
      progress: config.threshold,
      // The id is the seed, so the same day always yields the same companion.
      // Re-rolling by refreshing is not possible.
      seed: id,
      signals: {},
      ownedCompanionIds,
    },
    catalog,
    config,
  )

  return { ...result, claimed: !result.ignored }
}
