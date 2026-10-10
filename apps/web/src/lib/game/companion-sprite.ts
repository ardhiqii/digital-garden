/**
 * Client-safe sprite resolution for CATALOG companions.
 *
 * WHY THIS EXISTS: the collection tiles rendered ONE sprite for every companion. The grid
 * is a `'use client'` component and `CreatureSprite` reaches `node:fs` transitively, so the
 * page could only hand down a single server-rendered node -- and that node was the garden
 * stage's sporeling. A collection of `pikachu-family` and `abra-line` therefore rendered two
 * identical grass lizards, and the catalog's per-companion `animatedAsset` / `staticAsset` /
 * provider metadata were never used for a tile at all.
 *
 * This module is the missing client-safe half. It depends only on `sprites/pokeapi-pure`
 * (a committed-JSON lookup plus two URL builders: no `fs`, no network) and on the catalog's
 * own pure progression maths, so a `'use client'` tile can resolve its own companion without
 * dragging a Node built-in into the bundle.
 */
import {
  PROTOTYPE_COMPANION_CATALOG,
  resolveCompanionProgression,
  type CompanionDefinition,
  type CompanionForm,
} from './companion-catalog'
import { buildSpriteUrl, buildStaticSpriteUrl, type ResolvedSprite } from './sprites/pokeapi-pure'

/**
 * Measured animated-GIF dimensions, read from each file's own header (the GIF logical screen
 * descriptor) rather than guessed or rounded to a square.
 *
 * WHY MEASURE: `RemoteSprite` sets explicit `width`/`height`, and DESIGN.md 2.4 permits
 * integer scaling only -- fractional or percentage scaling turns pixel art to mush. So a
 * wrong size is a distorted sprite, not a cosmetic detail, and a nominal square box would
 * stretch every non-square GIF. These animated sprites range from 37x38 to 102x84.
 *
 * The static PNGs are all 96x96, which is why one box serves both variants: `RemoteSprite`
 * renders a single `<img>` with one width/height and swaps only the source file under
 * `prefers-reduced-motion`.
 *
 * `companion-sprite.test.ts` asserts every catalog form's id appears here, so adding a
 * companion without measuring its sprite fails a test instead of rendering it stretched.
 */
const ANIMATED_SIZE: Readonly<Record<number, { width: number; height: number }>> = {
  1: { width: 37, height: 38 }, // Bulbasaur
  2: { width: 58, height: 51 }, // Ivysaur
  3: { width: 86, height: 71 }, // Venusaur
  4: { width: 41, height: 42 }, // Charmander
  5: { width: 66, height: 56 }, // Charmeleon
  6: { width: 87, height: 89 }, // Charizard
  7: { width: 39, height: 43 }, // Squirtle
  8: { width: 60, height: 57 }, // Wartortle
  9: { width: 70, height: 66 }, // Blastoise
  25: { width: 50, height: 46 }, // Pikachu
  26: { width: 74, height: 73 }, // Raichu
  63: { width: 62, height: 53 }, // Abra
  64: { width: 78, height: 61 }, // Kadabra
  65: { width: 92, height: 69 }, // Alakazam
  92: { width: 67, height: 75 }, // Gastly
  93: { width: 85, height: 69 }, // Haunter
  94: { width: 74, height: 63 }, // Gengar
  129: { width: 47, height: 64 }, // Magikarp
  130: { width: 102, height: 84 }, // Gyarados
  131: { width: 68, height: 72 }, // Lapras
  132: { width: 47, height: 32 }, // Ditto
  143: { width: 74, height: 75 }, // Snorlax
  147: { width: 44, height: 51 }, // Dratini
  148: { width: 64, height: 73 }, // Dragonair
  149: { width: 80, height: 82 }, // Dragonite
  150: { width: 90, height: 69 }, // Mewtwo
}

/**
 * The PokeAPI sprite id for a form: the numeric id in `provider.formId`.
 *
 * The catalog writes this as the species' National Dex number (matching the existing
 * `pikachu` entry), which is the id PokeAPI uses for a default form's sprite path. Returns
 * null rather than NaN for a malformed value, so a bad entry renders nothing visibly broken
 * instead of requesting `.../animated/NaN.gif`.
 */
export function spriteIdForForm(form: CompanionForm): number | null {
  const raw = form.provider.formId
  if (raw === undefined || raw === null) return null
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * The sprite this companion is currently showing: its form at `xp`, resolved to a
 * renderable remote sprite, or null when the form cannot be resolved.
 *
 * Returns the `kind: 'remote'` variant of `ResolvedSprite`, which carries the same fields
 * `RemoteSprite` accepts. Callers should treat null as "fall back to whatever you rendered
 * before", not as an error worth surfacing.
 */
export function resolveCompanionSprite(
  definition: CompanionDefinition,
  xp = 0,
): Extract<ResolvedSprite, { kind: 'remote' }> | null {
  const { form } = resolveCompanionProgression(definition, xp)
  const id = spriteIdForForm(form)
  if (id === null) return null

  const size = ANIMATED_SIZE[id]
  if (!size) return null

  // A form with no animated asset is a still image: point `url` at the PNG rather than
  // promising an animation that does not exist.
  const animated = Boolean(form.animatedAsset)
  return {
    kind: 'remote',
    url: animated ? buildSpriteUrl(id) : buildStaticSpriteUrl(id),
    staticUrl: form.staticAsset ? buildStaticSpriteUrl(id) : null,
    width: size.width,
    height: size.height,
    animated,
  }
}

/** Exposed for the test that keeps the measured table in step with the catalog. */
export function hasMeasuredSize(id: number): boolean {
  return id in ANIMATED_SIZE
}

/**
 * Bare URL pair for a catalog companion, for callers that render their own element.
 *
 * WHY BOTH THIS AND `resolveCompanionSprite` EXIST: they serve different consumers and were
 * written on separate branches that both landed. The hatch overlay animates the freshly
 * hatched companion with its own markup and only needs URLs; a collection tile hands a fully
 * resolved sprite -- with a measured box for `RemoteSprite` -- and needs dimensions too.
 * Folding one into the other would either lose the measured box or make the overlay carry
 * sizing it does not use.
 *
 * Both go through `spriteIdForForm`, so there is still exactly one place that turns a form
 * into a PokeAPI id, and a malformed id yields null here rather than an `<img>` pointing at
 * `NaN` that renders as a broken-image icon.
 */
export interface CompanionSprite {
  /** The animated GIF, when the catalog marks this form as animated. */
  animated: string | null
  /** The still frame, used for `prefers-reduced-motion` and as the only option for static forms. */
  still: string
}

export function companionSprite(companionId: string): CompanionSprite | null {
  const definition = PROTOTYPE_COMPANION_CATALOG.get(companionId)
  const form = definition?.forms[0]
  if (!form) return null

  const id = spriteIdForForm(form)
  if (id === null) return null

  return {
    animated: form.animatedAsset ? buildSpriteUrl(id) : null,
    still: buildStaticSpriteUrl(id),
  }
}
