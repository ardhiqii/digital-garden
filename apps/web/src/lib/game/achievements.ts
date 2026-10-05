/**
 * Achievements as pure predicates over derived state.
 *
 * WHY PURE: an achievement is unlocked if its predicate holds *right now*. That
 * means nothing is persisted, no schema changes, and no migration — the same
 * property that makes titles cheap. It also means an achievement can never be
 * lost to a storage bug, and a replay of the same ledger always produces the
 * same unlocked set.
 *
 * WHY THE LEDGER, NOT RAW GITHUB: every predicate reads `acceptedLedgerEvents`
 * (already capped and de-duplicated) rather than raw commits or pushes. An
 * achievement that counted raw pushes would reintroduce exactly the farming the
 * event model exists to prevent, so none do.
 *
 * WHAT IS NEVER READ: note content, note titles, file paths, and tags. Only
 * event *categories*, counts, and the event's own timestamp are used. This is
 * the same boundary sync and public profiles respect.
 */

import { acceptedLedgerEvents, type EventCategory, type EventLedger } from './events'
import type { ProductState } from './product-state'
import { resolveTitle } from './titles'

export type AchievementCategory = 'craft' | 'shipping' | 'consistency' | 'collection' | 'meta'
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface AchievementContext {
  /** Accepted (capped, de-duplicated) events, in ledger order. */
  readonly events: readonly { readonly category: EventCategory; readonly occurredAt: string }[]
  /** Companion count in the collection. */
  readonly companionCount: number
  /** Companion ids that have been encountered at least once. */
  readonly encounteredCompanionIds: readonly string[]
  /** Number of encounter draws that were duplicates (Essence awarded). */
  readonly duplicateDraws: number
  /** Number of encounter draws total. */
  readonly drawCount: number
  /** Distinct companion ids across the collection. */
  readonly distinctCompanionIds: readonly string[]
  /** Family ids that have more than zero Essence. */
  readonly essenceFamilies: readonly string[]
  /** True when at least one local-provenance event exists. */
  readonly hasLocalEvent: boolean
  /** True when at least one verified-provenance event exists. */
  readonly hasVerifiedEvent: boolean
  /** True when the active companion has reached its mastery (final) slot. */
  readonly activeCompanionAtMastery: boolean
  /** Total XP across all companions. */
  readonly totalXp: number
}

export interface Achievement {
  id: string
  name: string
  category: AchievementCategory
  rarity: AchievementRarity
  /** Short description of what earns it. */
  description: string
  /** Pure predicate: true when unlocked. */
  unlocked: (ctx: AchievementContext) => boolean
  /** 0..1 progress toward unlock, for the locked-state UI. */
  progress: (ctx: AchievementContext) => number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function ratio(current: number, target: number): number {
  if (target <= 0) return 1
  return clamp01(current / target)
}

function countCategory(ctx: AchievementContext, category: EventCategory): number {
  return ctx.events.filter((event) => event.category === category).length
}

/** Longest run of consecutive calendar days present in the event timestamps. */
function longestDailyStreak(ctx: AchievementContext): number {
  const days = new Set<string>()
  for (const event of ctx.events) {
    const day = event.occurredAt.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day)
  }
  if (days.size === 0) return 0

  const ordered = [...days].sort()
  let best = 1
  let run = 1
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = Date.parse(`${ordered[i - 1]}T00:00:00Z`)
    const current = Date.parse(`${ordered[i]}T00:00:00Z`)
    const dayGap = Math.round((current - previous) / 86_400_000)
    if (dayGap === 1) run += 1
    else run = 1
    if (run > best) best = run
  }
  return best
}

/** True when any event happened between 00:00 and 04:00 UTC. */
function hasDeepNightEvent(ctx: AchievementContext): boolean {
  return ctx.events.some((event) => {
    const hour = new Date(event.occurredAt).getUTCHours()
    return Number.isFinite(hour) && hour < 4
  })
}

/** True when any event happened on a Saturday or Sunday (UTC). */
function hasWeekendEvent(ctx: AchievementContext): boolean {
  return ctx.events.some((event) => {
    const day = new Date(event.occurredAt).getUTCDay()
    return day === 0 || day === 6
  })
}

function totalWordsFromEvents(ctx: AchievementContext): number {
  // One `new-words` event represents one 100-word bucket, so the count of those
  // events is the number of buckets, not the word total. The bucket count is
  // the honest, content-free signal available here.
  return countCategory(ctx, 'new-words')
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ---------------------------------------------------------------- craft
  {
    id: 'first_note',
    name: 'First Sprout',
    category: 'craft',
    rarity: 'common',
    description: 'Write your first note.',
    unlocked: (ctx) => countCategory(ctx, 'new-note') >= 1,
    progress: (ctx) => ratio(countCategory(ctx, 'new-note'), 1),
  },
  {
    id: 'notekeeper',
    name: 'Notekeeper',
    category: 'craft',
    rarity: 'rare',
    description: 'Write 25 notes.',
    unlocked: (ctx) => countCategory(ctx, 'new-note') >= 25,
    progress: (ctx) => ratio(countCategory(ctx, 'new-note'), 25),
  },
  {
    id: 'century_club',
    name: 'Century Club',
    category: 'craft',
    rarity: 'epic',
    description: 'Write 100 notes.',
    unlocked: (ctx) => countCategory(ctx, 'new-note') >= 100,
    progress: (ctx) => ratio(countCategory(ctx, 'new-note'), 100),
  },
  {
    id: 'long_form',
    name: 'Long-form',
    category: 'craft',
    rarity: 'rare',
    description: 'Write 10,000 words (100 hundred-word stretches).',
    unlocked: (ctx) => totalWordsFromEvents(ctx) >= 100,
    progress: (ctx) => ratio(totalWordsFromEvents(ctx), 100),
  },
  {
    id: 'weaver',
    name: 'Weaver',
    category: 'craft',
    rarity: 'rare',
    description: 'Resolve 50 wikilinks.',
    unlocked: (ctx) => countCategory(ctx, 'resolved-wikilink') >= 50,
    progress: (ctx) => ratio(countCategory(ctx, 'resolved-wikilink'), 50),
  },
  {
    id: 'librarian',
    name: 'Librarian',
    category: 'craft',
    rarity: 'epic',
    description: 'Resolve 500 wikilinks.',
    unlocked: (ctx) => countCategory(ctx, 'resolved-wikilink') >= 500,
    progress: (ctx) => ratio(countCategory(ctx, 'resolved-wikilink'), 500),
  },

  // ------------------------------------------------------------- shipping
  {
    id: 'first_merge',
    name: 'First Merge',
    category: 'shipping',
    rarity: 'common',
    description: 'Get a pull request merged.',
    unlocked: (ctx) => countCategory(ctx, 'merged-pull-request') >= 1,
    progress: (ctx) => ratio(countCategory(ctx, 'merged-pull-request'), 1),
  },
  {
    id: 'ship_it',
    name: 'Ship It',
    category: 'shipping',
    rarity: 'rare',
    description: 'Merge 25 pull requests.',
    unlocked: (ctx) => countCategory(ctx, 'merged-pull-request') >= 25,
    progress: (ctx) => ratio(countCategory(ctx, 'merged-pull-request'), 25),
  },
  {
    id: 'release_engineer',
    name: 'Release Engineer',
    category: 'shipping',
    rarity: 'epic',
    description: 'Publish 10 releases.',
    unlocked: (ctx) => countCategory(ctx, 'published-release') >= 10,
    progress: (ctx) => ratio(countCategory(ctx, 'published-release'), 10),
  },
  {
    id: 'green_build',
    name: 'Green Build',
    category: 'shipping',
    rarity: 'rare',
    description: 'Pass 50 CI runs on your merged work.',
    unlocked: (ctx) => countCategory(ctx, 'successful-ci') >= 50,
    progress: (ctx) => ratio(countCategory(ctx, 'successful-ci'), 50),
  },
  {
    id: 'closer',
    name: 'Closer',
    category: 'shipping',
    rarity: 'rare',
    description: 'Close 25 issues linked to your pull requests.',
    unlocked: (ctx) => countCategory(ctx, 'closed-linked-issue') >= 25,
    progress: (ctx) => ratio(countCategory(ctx, 'closed-linked-issue'), 25),
  },

  // ---------------------------------------------------------- consistency
  {
    id: 'first_day',
    name: 'Day One',
    category: 'consistency',
    rarity: 'common',
    description: 'Have one qualifying active day.',
    unlocked: (ctx) => countCategory(ctx, 'qualifying-active-day') >= 1,
    progress: (ctx) => ratio(countCategory(ctx, 'qualifying-active-day'), 1),
  },
  {
    id: 'week_streak',
    name: 'Steady Week',
    category: 'consistency',
    rarity: 'rare',
    description: 'Work 7 days in a row.',
    unlocked: (ctx) => longestDailyStreak(ctx) >= 7,
    progress: (ctx) => ratio(longestDailyStreak(ctx), 7),
  },
  {
    id: 'month_streak',
    name: 'Unbroken',
    category: 'consistency',
    rarity: 'epic',
    description: 'Work 30 days in a row.',
    unlocked: (ctx) => longestDailyStreak(ctx) >= 30,
    progress: (ctx) => ratio(longestDailyStreak(ctx), 30),
  },
  {
    id: 'deep_work',
    name: 'Deep Work',
    category: 'consistency',
    rarity: 'rare',
    description: 'Complete 10 two-hour work sessions.',
    unlocked: (ctx) => countCategory(ctx, 'work-session') >= 10,
    progress: (ctx) => ratio(countCategory(ctx, 'work-session'), 10),
  },

  // ----------------------------------------------------------- collection
  {
    id: 'first_encounter',
    name: 'First Encounter',
    category: 'collection',
    rarity: 'common',
    description: 'Meet your first companion.',
    unlocked: (ctx) => ctx.drawCount >= 1,
    progress: (ctx) => ratio(ctx.drawCount, 1),
  },
  {
    id: 'essence_found',
    name: 'Essence Found',
    category: 'collection',
    rarity: 'common',
    description: 'Meet a duplicate and gain Essence.',
    unlocked: (ctx) => ctx.duplicateDraws >= 1,
    progress: (ctx) => ratio(ctx.duplicateDraws, 1),
  },
  {
    id: 'collector',
    name: 'Collector',
    category: 'collection',
    rarity: 'rare',
    description: 'Collect 5 companions.',
    unlocked: (ctx) => ctx.distinctCompanionIds.length >= 5,
    progress: (ctx) => ratio(ctx.distinctCompanionIds.length, 5),
  },
  {
    id: 'family_complete',
    name: 'Full Family',
    category: 'collection',
    rarity: 'legendary',
    description: 'Gather Essence in three different families.',
    unlocked: (ctx) => ctx.essenceFamilies.length >= 3,
    progress: (ctx) => ratio(ctx.essenceFamilies.length, 3),
  },
  {
    id: 'mastery',
    name: 'Mastery',
    category: 'collection',
    rarity: 'legendary',
    description: 'Reach the mastery form of your active companion.',
    unlocked: (ctx) => ctx.activeCompanionAtMastery,
    progress: (ctx) => (ctx.activeCompanionAtMastery ? 1 : 0),
  },

  // ------------------------------------------------------------------ meta
  {
    id: 'welcome',
    name: 'Welcome',
    category: 'meta',
    rarity: 'common',
    description: 'Start a companion.',
    // Every valid product state has a profile with an active companion.
    unlocked: (ctx) => ctx.companionCount >= 1,
    progress: (ctx) => ratio(ctx.companionCount, 1),
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    category: 'meta',
    rarity: 'rare',
    description: 'Do something between midnight and 4am.',
    unlocked: hasDeepNightEvent,
    progress: (ctx) => (hasDeepNightEvent(ctx) ? 1 : 0),
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    category: 'meta',
    rarity: 'rare',
    description: 'Do something on a weekend.',
    unlocked: hasWeekendEvent,
    progress: (ctx) => (hasWeekendEvent(ctx) ? 1 : 0),
  },
  {
    id: 'both_worlds',
    name: 'Both Worlds',
    category: 'meta',
    rarity: 'rare',
    description: 'Earn XP from both local notes and GitHub activity.',
    unlocked: (ctx) => ctx.hasLocalEvent && ctx.hasVerifiedEvent,
    progress: (ctx) => (ctx.hasLocalEvent ? 0.5 : 0) + (ctx.hasVerifiedEvent ? 0.5 : 0),
  },
] as const

export interface UnlockedAchievement {
  achievement: Achievement
  unlocked: boolean
  progress: number
}

/** Build the predicate context from product state. Pure. */
export function achievementContext(state: ProductState): AchievementContext {
  const events = acceptedLedgerEvents(state.ledger)
  const draws = state.encounters.draws
  const distinctCompanionIds = [...new Set(state.profile.collection.map((r) => r.companionId))]

  return {
    events: events.map((event) => ({ category: event.category, occurredAt: event.occurredAt })),
    companionCount: state.companions.length,
    encounteredCompanionIds: distinctCompanionIds,
    duplicateDraws: draws.filter((draw) => draw.isDuplicate).length,
    drawCount: draws.length,
    distinctCompanionIds,
    essenceFamilies: Object.keys(state.encounters.essenceByFamily),
    hasLocalEvent: events.some((event) => event.provenance === 'local'),
    hasVerifiedEvent: events.some((event) => event.provenance === 'verified'),
    activeCompanionAtMastery: state.activeCompanion?.progression?.step.kind === 'mastery',
    totalXp: state.companions.reduce((sum, companion) => sum + companion.xp, 0),
  }
}

/** Every achievement with its current status, unlocked first then by category. */
export function resolveAchievements(state: ProductState): UnlockedAchievement[] {
  const ctx = achievementContext(state)
  return ACHIEVEMENTS.map((achievement) => ({
    achievement,
    unlocked: achievement.unlocked(ctx),
    progress: clamp01(achievement.progress(ctx)),
  })).sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
    return 0
  })
}

/** The unlocked subset only. */
export function unlockedAchievements(state: ProductState): Achievement[] {
  return resolveAchievements(state)
    .filter((entry) => entry.unlocked)
    .map((entry) => entry.achievement)
}

/** The user's current title for their total XP. */
export function titleForState(state: ProductState) {
  const ctx = achievementContext(state)
  return resolveTitle(ctx.totalXp)
}

export type { EventLedger }
