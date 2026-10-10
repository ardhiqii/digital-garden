/**
 * What the reveal card should say about one draw.
 *
 * WHY THIS IS A MODULE AND NOT A TERNARY IN THE COMPONENT: both draw paths (the
 * activity meter and the daily claim) now hand the user an EGG, and a draw that is
 * sitting in the inventory is not in the collection. The reveal card was written
 * before eggs existed, so it announced every non-duplicate draw as "new companion
 * added to your collection". That sentence was false the moment the egg loop
 * shipped, and it was false in the worst way: it named a companion the user could
 * not find, and offered a "Make active" button that `switchActiveCompanion` refuses,
 * because it requires collection membership. The button did nothing and the copy
 * pointed at the wrong screen.
 *
 * Three outcomes, and they are mutually exclusive:
 *   - `egg`        the draw is waiting as an egg; opening it is a separate act
 *   - `duplicate`  the species was already owned, so it paid Essence instead
 *   - `collection` the companion really is in the collection
 *
 * `egg` is checked before `duplicate` on purpose. A duplicate never becomes an egg
 * (`layEggs` drops it), so the two cannot both be true, and checking `egg` first
 * means a hand-edited or restored profile that somehow has both is described by
 * what the user can actually see in the inventory.
 */

import type { PersistedEncounterDraw } from './encounters'

export type RevealKind = 'egg' | 'duplicate' | 'collection'

/** The reveal verdict for one draw, given the draw ids currently sitting as eggs. */
export function revealKindFor(
  draw: Pick<PersistedEncounterDraw, 'id' | 'isDuplicate'>,
  eggDrawIds: ReadonlySet<string>,
): RevealKind {
  if (eggDrawIds.has(draw.id)) return 'egg'
  return draw.isDuplicate ? 'duplicate' : 'collection'
}

/**
 * The sentence under the companion's name.
 *
 * Kept here, next to the verdict it describes, so a change to one cannot leave the
 * other claiming something different.
 */
export function revealLabel(
  kind: RevealKind,
  draw: Pick<PersistedEncounterDraw, 'essenceAwarded'>,
): string {
  switch (kind) {
    // Points at the screen that can actually open it. The inventory is on
    // /companions; nothing on this card can turn an egg into a companion.
    case 'egg':
      return 'Waiting as an egg · open it from Your companions'
    case 'duplicate':
      return `Duplicate · +${draw.essenceAwarded} Essence for this family`
    case 'collection':
      return 'New companion added to your collection'
  }
}

/**
 * Whether the card may offer to make this draw active.
 *
 * `switchActiveCompanion` refuses a companion that is not in the collection, so
 * offering the control for an unhatched egg is a button that silently does nothing.
 */
export function revealOffersMakeActive(kind: RevealKind): boolean {
  return kind === 'collection'
}
