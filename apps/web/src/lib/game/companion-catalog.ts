/**
 * Provider-neutral companion definitions.
 *
 * This module deliberately knows nothing about PokeAPI, URLs, or rendering.
 * A provider resolves the opaque asset references at the edge of the app;
 * the game only needs a stable identity, a family, and a valid progression.
 */

export type CompanionRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'

export type ProgressionKind = 'base' | 'evolution' | 'form' | 'mastery'

export interface AssetReference {
  /** Opaque provider-owned key. This is not required to be a URL. */
  key: string
  /** Optional provider-specific variant, such as an idle or front-facing pose. */
  variant?: string
}

export type ProviderValue = string | number | boolean

export interface ProviderMetadata {
  /** Provider namespace, for example `pokeapi` or `artist:studio-name`. */
  providerId: string
  /** Stable provider entity identifier, for example a species or artwork ID. */
  entityId: string
  /** Stable provider form identifier when the entity has forms. */
  formId?: string
  /** Small, serializable metadata bag for adapters and attribution surfaces. */
  metadata?: Readonly<Record<string, ProviderValue>>
}

export interface CompanionForm {
  id: string
  name: string
  kind: ProgressionKind
  provider: ProviderMetadata
  /** A form can expose animation, a static asset, or both. */
  animatedAsset?: AssetReference
  staticAsset?: AssetReference
}

export interface ProgressionStep {
  id: string
  name: string
  /** Cumulative XP required to enter this step. The first step must be zero. */
  threshold: number
  formId: string
  kind: ProgressionKind
  blurb?: string
}

export interface CompanionDefinition {
  /** Stable collectible identity. Two encounters of this ID are duplicates. */
  id: string
  /** Family-specific Essence is tracked under this ID. */
  familyId: string
  name: string
  rarity: CompanionRarity
  /** Optional override for the rarity's default encounter weight. */
  baseEncounterWeight?: number
  /** Tags used by the rules-based encounter matcher. */
  encounterTags: readonly string[]
  /** Lowercase or mixed-case source values are normalized by the encounter engine. */
  preferredLanguages: readonly string[]
  /** Extensions may be written as `ts` or `.ts`; both are normalized. */
  preferredFileTypes: readonly string[]
  forms: readonly CompanionForm[]
  /** Ordered, explicit path. Evolution and mastery are never inferred. */
  progression: readonly ProgressionStep[]
}

export interface CompanionCatalog {
  readonly entries: readonly CompanionDefinition[]
  get(id: string): CompanionDefinition | undefined
  list(): readonly CompanionDefinition[]
}

const PROGRESSION_KINDS: readonly ProgressionKind[] = [
  'base',
  'evolution',
  'form',
  'mastery',
] as const

export interface ResolvedProgression {
  step: ProgressionStep
  form: CompanionForm
  nextStep: ProgressionStep | null
  nextForm: CompanionForm | null
  xpIntoStep: number
  xpForNextStep: number | null
  progress: number
}

const RARITIES: readonly CompanionRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
}

function requireFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`)
  }
}

function requireUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    requireNonEmpty(value, `${label} entry`)
    if (seen.has(value)) throw new Error(`${label} contains duplicate ID "${value}"`)
    seen.add(value)
  }
}

function validateProvider(provider: ProviderMetadata, label: string): void {
  requireNonEmpty(provider.providerId, `${label}.providerId`)
  requireNonEmpty(provider.entityId, `${label}.entityId`)
  if (provider.formId !== undefined) requireNonEmpty(provider.formId, `${label}.formId`)
}

function validateDefinition(definition: CompanionDefinition): void {
  requireNonEmpty(definition.id, 'companion.id')
  requireNonEmpty(definition.familyId, `${definition.id}.familyId`)
  requireNonEmpty(definition.name, `${definition.id}.name`)
  if (!RARITIES.includes(definition.rarity)) {
    throw new Error(`${definition.id}.rarity is not supported`)
  }
  if (
    definition.baseEncounterWeight !== undefined &&
    (!Number.isFinite(definition.baseEncounterWeight) || definition.baseEncounterWeight <= 0)
  ) {
    throw new Error(`${definition.id}.baseEncounterWeight must be positive and finite`)
  }

  requireUnique(definition.forms.map((form) => form.id), `${definition.id}.forms`)
  if (definition.forms.length === 0) throw new Error(`${definition.id} needs at least one form`)

  const formsById = new Map<string, CompanionForm>()
  for (const form of definition.forms) {
    requireNonEmpty(form.id, `${definition.id}.form.id`)
    requireNonEmpty(form.name, `${definition.id}.${form.id}.name`)
    if (!PROGRESSION_KINDS.includes(form.kind)) {
      throw new Error(`${definition.id}.${form.id}.kind is not supported`)
    }
    validateProvider(form.provider, `${definition.id}.${form.id}.provider`)
    if (!form.animatedAsset && !form.staticAsset) {
      throw new Error(`${definition.id}.${form.id} needs an animated or static asset`)
    }
    if (form.animatedAsset) requireNonEmpty(form.animatedAsset.key, `${definition.id}.${form.id}.animatedAsset.key`)
    if (form.staticAsset) requireNonEmpty(form.staticAsset.key, `${definition.id}.${form.id}.staticAsset.key`)
    formsById.set(form.id, form)
  }

  if (definition.progression.length === 0) {
    throw new Error(`${definition.id} needs at least one progression step`)
  }
  requireUnique(definition.progression.map((step) => step.id), `${definition.id}.progression`)
  let previousThreshold = -1
  definition.progression.forEach((step, index) => {
    requireNonEmpty(step.id, `${definition.id}.progression.id`)
    requireNonEmpty(step.name, `${definition.id}.${step.id}.name`)
    requireFiniteNonNegative(step.threshold, `${definition.id}.${step.id}.threshold`)
    if (!PROGRESSION_KINDS.includes(step.kind)) {
      throw new Error(`${definition.id}.${step.id}.kind is not supported`)
    }
    if (index === 0 && step.threshold !== 0) {
      throw new Error(`${definition.id} must start at progression threshold 0`)
    }
    if (step.threshold <= previousThreshold) {
      throw new Error(`${definition.id}.progression thresholds must be strictly increasing`)
    }
    const form = formsById.get(step.formId)
    if (!form) throw new Error(`${definition.id}.${step.id} references missing form "${step.formId}"`)
    if (form.kind !== step.kind) {
      throw new Error(`${definition.id}.${step.id} kind must match form "${step.formId}"`)
    }
    if (index === 0 && step.kind !== 'base') {
      throw new Error(`${definition.id} must start with a base progression step`)
    }
    previousThreshold = step.threshold
  })
}

export function createCompanionCatalog(
  definitions: readonly CompanionDefinition[],
): CompanionCatalog {
  const seen = new Set<string>()
  for (const definition of definitions) {
    validateDefinition(definition)
    if (seen.has(definition.id)) throw new Error(`duplicate companion ID "${definition.id}"`)
    seen.add(definition.id)
  }

  const entries = definitions.map((definition) => ({
    ...definition,
    encounterTags: [...definition.encounterTags],
    preferredLanguages: [...definition.preferredLanguages],
    preferredFileTypes: [...definition.preferredFileTypes],
    forms: definition.forms.map((form) => ({ ...form })),
    progression: definition.progression.map((step) => ({ ...step })),
  }))
  const byId = new Map(entries.map((definition) => [definition.id, definition]))

  return {
    entries,
    get: (id) => byId.get(id),
    list: () => entries,
  }
}

export function getCompanionForm(
  definition: CompanionDefinition,
  formId: string,
): CompanionForm {
  const form = definition.forms.find((candidate) => candidate.id === formId)
  if (!form) throw new Error(`${definition.id} has no form "${formId}"`)
  return form
}

export function resolveCompanionProgression(
  definition: CompanionDefinition,
  totalXp: number,
): ResolvedProgression {
  const xp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0
  let index = 0
  for (let i = 0; i < definition.progression.length; i += 1) {
    if (xp >= definition.progression[i].threshold) index = i
    else break
  }

  const step = definition.progression[index]
  const nextStep = definition.progression[index + 1] ?? null
  const form = getCompanionForm(definition, step.formId)
  const nextForm = nextStep ? getCompanionForm(definition, nextStep.formId) : null
  if (!nextStep) {
    return {
      step,
      form,
      nextStep: null,
      nextForm: null,
      xpIntoStep: xp - step.threshold,
      xpForNextStep: null,
      progress: 1,
    }
  }

  const xpForNextStep = nextStep.threshold - step.threshold
  return {
    step,
    form,
    nextStep,
    nextForm,
    xpIntoStep: xp - step.threshold,
    xpForNextStep,
    progress: Math.min(1, Math.max(0, (xp - step.threshold) / xpForNextStep)),
  }
}

/**
 * Prototype definitions used by local playtests. The game still stores only
 * opaque provider references; `pokemon-provider.ts` resolves these references
 * to live PokeAPI metadata and chooses animation or static fallback at the
 * rendering boundary. Pokémon content remains prototype-only and is not a
 * commercial marketplace asset.
 */
export const PROTOTYPE_COMPANION_CATALOG = createCompanionCatalog([
  {
    id: 'pikachu-family',
    familyId: 'pikachu-family',
    name: 'Pikachu family',
    rarity: 'common',
    encounterTags: ['energy', 'social', 'momentum'],
    preferredLanguages: ['typescript', 'javascript'],
    preferredFileTypes: ['ts', 'tsx', 'js', 'jsx'],
    forms: [
      {
        id: 'base',
        name: 'Pikachu',
        kind: 'base',
        provider: {
          providerId: 'pokeapi',
          entityId: 'pikachu',
          formId: '25',
          metadata: { evolutionChainId: 10 },
        },
        animatedAsset: { key: 'pokeapi:pokemon:pikachu:25', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:pikachu:25', variant: 'static' },
      },
      {
        id: 'evolved',
        name: 'Raichu',
        kind: 'evolution',
        provider: {
          providerId: 'pokeapi',
          entityId: 'raichu',
          formId: '26',
          metadata: { evolutionChainId: 10 },
        },
        animatedAsset: { key: 'pokeapi:pokemon:raichu:26', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:raichu:26', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
      { id: 'evolved', name: 'Charged', threshold: 100, formId: 'evolved', kind: 'evolution' },
    ],
  },
  {
    id: 'ditto-like',
    familyId: 'ditto-family',
    name: 'Ditto-like',
    rarity: 'uncommon',
    encounterTags: ['adaptation', 'refactor', 'testing'],
    preferredLanguages: ['python', 'ruby'],
    preferredFileTypes: ['py', 'rb', 'md'],
    forms: [
      {
        id: 'base',
        name: 'Ditto',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'ditto', formId: '132' },
        // Ditto was the only entry without an animated asset, which rendered it as the one
        // still sprite in a catalog of GIFs. PokeAPI serves 132.gif (verified 200), so the
        // omission was an oversight rather than a constraint, and the reviewer flagged
        // inconsistent animation as a defect.
        animatedAsset: { key: 'pokeapi:pokemon:ditto:132', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:ditto:132', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
    ],
  },

  /*
    The catalog started as two entries, which made the daily draw a two-day feature: once
    both were owned, every draw resolved to a duplicate, duplicates pay only Essence, and
    Essence is not visible or spendable anywhere in the UI. Measured before this change: a
    viewer owning just the starter got a companion on 32.5% of days and nothing on the
    rest; owning both ended the reward permanently.

    The selection rule now prefers entries the viewer does not own (see
    `selectableWeights` in encounters.ts), so the runway is bounded by THIS list. Twelve
    entries is twelve productive days, measured.

    Every `entityId` and numeric `formId` below was resolved against PokeAPI rather than
    written from memory, and each animated sprite URL was confirmed to return 200. All ids
    are <= 649, so the generation-v animated GIF exists and no entry falls back to a still
    image. `metadata.evolutionChainId` is deliberately omitted: it is an optional fallback
    for live lookups, and inventing chain numbers would be worse than leaving it out.
  */
  {
    id: 'bulbasaur-line',
    familyId: 'bulbasaur-line',
    name: 'Bulbasaur line',
    rarity: 'common',
    encounterTags: ['docs', 'growth', 'foundation'],
    preferredLanguages: ['markdown'],
    preferredFileTypes: ['md', 'mdx', 'txt'],
    forms: [
      {
        id: 'base',
        name: 'Bulbasaur',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'bulbasaur', formId: '1' },
        animatedAsset: { key: 'pokeapi:pokemon:bulbasaur:1', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:bulbasaur:1', variant: 'static' },
      },
      {
        id: 'evolved',
        name: 'Ivysaur',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'ivysaur', formId: '2' },
        animatedAsset: { key: 'pokeapi:pokemon:ivysaur:2', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:ivysaur:2', variant: 'static' },
      },
      {
        id: 'final',
        name: 'Venusaur',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'venusaur', formId: '3' },
        animatedAsset: { key: 'pokeapi:pokemon:venusaur:3', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:venusaur:3', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
      { id: 'evolved', name: 'Blooming', threshold: 120, formId: 'evolved', kind: 'evolution' },
      { id: 'final', name: 'Overgrown', threshold: 600, formId: 'final', kind: 'evolution' },
    ],
  },
  {
    id: 'charmander-line',
    familyId: 'charmander-line',
    name: 'Charmander line',
    rarity: 'common',
    encounterTags: ['hotfix', 'shipping', 'performance'],
    preferredLanguages: ['javascript', 'typescript'],
    preferredFileTypes: ['js', 'jsx', 'ts', 'tsx'],
    forms: [
      {
        id: 'base',
        name: 'Charmander',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'charmander', formId: '4' },
        animatedAsset: { key: 'pokeapi:pokemon:charmander:4', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:charmander:4', variant: 'static' },
      },
      {
        id: 'evolved',
        name: 'Charmeleon',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'charmeleon', formId: '5' },
        animatedAsset: { key: 'pokeapi:pokemon:charmeleon:5', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:charmeleon:5', variant: 'static' },
      },
      {
        id: 'final',
        name: 'Charizard',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'charizard', formId: '6' },
        animatedAsset: { key: 'pokeapi:pokemon:charizard:6', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:charizard:6', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
      { id: 'evolved', name: 'Kindled', threshold: 120, formId: 'evolved', kind: 'evolution' },
      { id: 'final', name: 'Blazing', threshold: 600, formId: 'final', kind: 'evolution' },
    ],
  },
  {
    id: 'squirtle-line',
    familyId: 'squirtle-line',
    name: 'Squirtle line',
    rarity: 'common',
    encounterTags: ['refactor', 'cleanup', 'stability'],
    preferredLanguages: ['python', 'go'],
    preferredFileTypes: ['py', 'go'],
    forms: [
      {
        id: 'base',
        name: 'Squirtle',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'squirtle', formId: '7' },
        animatedAsset: { key: 'pokeapi:pokemon:squirtle:7', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:squirtle:7', variant: 'static' },
      },
      {
        id: 'evolved',
        name: 'Wartortle',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'wartortle', formId: '8' },
        animatedAsset: { key: 'pokeapi:pokemon:wartortle:8', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:wartortle:8', variant: 'static' },
      },
      {
        id: 'final',
        name: 'Blastoise',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'blastoise', formId: '9' },
        animatedAsset: { key: 'pokeapi:pokemon:blastoise:9', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:blastoise:9', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
      { id: 'evolved', name: 'Sheltered', threshold: 120, formId: 'evolved', kind: 'evolution' },
      { id: 'final', name: 'Tidal', threshold: 600, formId: 'final', kind: 'evolution' },
    ],
  },
  {
    id: 'magikarp-line',
    familyId: 'magikarp-line',
    name: 'Magikarp line',
    rarity: 'uncommon',
    encounterTags: ['persistence', 'comeback', 'testing'],
    preferredLanguages: ['ruby', 'php'],
    preferredFileTypes: ['rb', 'php'],
    forms: [
      {
        id: 'base',
        name: 'Magikarp',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'magikarp', formId: '129' },
        animatedAsset: { key: 'pokeapi:pokemon:magikarp:129', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:magikarp:129', variant: 'static' },
      },
      {
        id: 'evolved',
        name: 'Gyarados',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'gyarados', formId: '130' },
        animatedAsset: { key: 'pokeapi:pokemon:gyarados:130', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:gyarados:130', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
      { id: 'evolved', name: 'Leaping', threshold: 200, formId: 'evolved', kind: 'evolution' },
    ],
  },
  {
    id: 'abra-line',
    familyId: 'abra-line',
    name: 'Abra line',
    rarity: 'rare',
    encounterTags: ['algorithms', 'async', 'reasoning'],
    preferredLanguages: ['rust', 'haskell'],
    preferredFileTypes: ['rs', 'hs'],
    forms: [
      {
        id: 'base',
        name: 'Abra',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'abra', formId: '63' },
        animatedAsset: { key: 'pokeapi:pokemon:abra:63', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:abra:63', variant: 'static' },
      },
      {
        id: 'evolved',
        name: 'Kadabra',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'kadabra', formId: '64' },
        animatedAsset: { key: 'pokeapi:pokemon:kadabra:64', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:kadabra:64', variant: 'static' },
      },
      {
        id: 'final',
        name: 'Alakazam',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'alakazam', formId: '65' },
        animatedAsset: { key: 'pokeapi:pokemon:alakazam:65', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:alakazam:65', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
      { id: 'evolved', name: 'Focused', threshold: 150, formId: 'evolved', kind: 'evolution' },
      { id: 'final', name: 'Unbound', threshold: 700, formId: 'final', kind: 'evolution' },
    ],
  },
  {
    id: 'gastly-line',
    familyId: 'gastly-line',
    name: 'Gastly line',
    rarity: 'rare',
    encounterTags: ['legacy', 'archaeology', 'dead-code'],
    preferredLanguages: ['c', 'cpp'],
    preferredFileTypes: ['c', 'h', 'cpp'],
    forms: [
      {
        id: 'base',
        name: 'Gastly',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'gastly', formId: '92' },
        animatedAsset: { key: 'pokeapi:pokemon:gastly:92', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:gastly:92', variant: 'static' },
      },
      {
        id: 'evolved',
        name: 'Haunter',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'haunter', formId: '93' },
        animatedAsset: { key: 'pokeapi:pokemon:haunter:93', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:haunter:93', variant: 'static' },
      },
      {
        id: 'final',
        name: 'Gengar',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'gengar', formId: '94' },
        animatedAsset: { key: 'pokeapi:pokemon:gengar:94', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:gengar:94', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
      { id: 'evolved', name: 'Lingering', threshold: 150, formId: 'evolved', kind: 'evolution' },
      { id: 'final', name: 'Hollowed', threshold: 700, formId: 'final', kind: 'evolution' },
    ],
  },
  {
    id: 'snorlax',
    familyId: 'snorlax',
    name: 'Snorlax',
    rarity: 'rare',
    encounterTags: ['deep-work', 'maintenance', 'patience'],
    preferredLanguages: ['sql'],
    preferredFileTypes: ['sql', 'yml', 'yaml'],
    forms: [
      {
        id: 'base',
        name: 'Snorlax',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'snorlax', formId: '143' },
        animatedAsset: { key: 'pokeapi:pokemon:snorlax:143', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:snorlax:143', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
    ],
  },
  {
    id: 'lapras',
    familyId: 'lapras',
    name: 'Lapras',
    rarity: 'rare',
    encounterTags: ['infrastructure', 'deployment', 'migration'],
    preferredLanguages: ['shell', 'dockerfile'],
    preferredFileTypes: ['sh', 'dockerfile', 'tf'],
    forms: [
      {
        id: 'base',
        name: 'Lapras',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'lapras', formId: '131' },
        animatedAsset: { key: 'pokeapi:pokemon:lapras:131', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:lapras:131', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
    ],
  },
  {
    id: 'dratini-line',
    familyId: 'dratini-line',
    name: 'Dratini line',
    rarity: 'epic',
    encounterTags: ['scale', 'architecture', 'ambition'],
    preferredLanguages: ['java', 'kotlin'],
    preferredFileTypes: ['java', 'kt', 'scala'],
    forms: [
      {
        id: 'base',
        name: 'Dratini',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'dratini', formId: '147' },
        animatedAsset: { key: 'pokeapi:pokemon:dratini:147', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:dratini:147', variant: 'static' },
      },
      {
        id: 'evolved',
        name: 'Dragonair',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'dragonair', formId: '148' },
        animatedAsset: { key: 'pokeapi:pokemon:dragonair:148', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:dragonair:148', variant: 'static' },
      },
      {
        id: 'final',
        name: 'Dragonite',
        kind: 'evolution',
        provider: { providerId: 'pokeapi', entityId: 'dragonite', formId: '149' },
        animatedAsset: { key: 'pokeapi:pokemon:dragonite:149', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:dragonite:149', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
      { id: 'evolved', name: 'Ascending', threshold: 250, formId: 'evolved', kind: 'evolution' },
      { id: 'final', name: 'Skyborne', threshold: 900, formId: 'final', kind: 'evolution' },
    ],
  },
  {
    id: 'mewtwo',
    familyId: 'mewtwo',
    name: 'Mewtwo',
    rarity: 'legendary',
    encounterTags: ['breakthrough', 'mastery', 'rare'],
    preferredLanguages: ['cuda', 'zig'],
    preferredFileTypes: ['cu', 'zig', 'asm'],
    forms: [
      {
        id: 'base',
        name: 'Mewtwo',
        kind: 'base',
        provider: { providerId: 'pokeapi', entityId: 'mewtwo', formId: '150' },
        animatedAsset: { key: 'pokeapi:pokemon:mewtwo:150', variant: 'animated' },
        staticAsset: { key: 'pokeapi:pokemon:mewtwo:150', variant: 'static' },
      },
    ],
    progression: [
      { id: 'base', name: 'Beginning', threshold: 0, formId: 'base', kind: 'base' },
    ],
  },
] as const)
