import { describe, expect, it } from 'vitest'
import {
  createCompanionCatalog,
  PROTOTYPE_COMPANION_CATALOG,
  resolveCompanionProgression,
  type CompanionDefinition,
} from './companion-catalog'

describe('companion catalog', () => {
  it('keeps the game provider-neutral while configuring real PokeAPI references', () => {
    // The count is asserted deliberately: the daily draw prefers companions the viewer
    // does not own, so this number IS the runway before duplicates start. It was 2, which
    // made the "come back every day" reward a two-day feature. Do not let it shrink back
    // without saying so out loud.
    expect(PROTOTYPE_COMPANION_CATALOG.list()).toHaveLength(12)
    const pikachuFamily = PROTOTYPE_COMPANION_CATALOG.get('pikachu-family')!
    expect(pikachuFamily.forms[0].provider.providerId).toBe('pokeapi')
    expect(pikachuFamily.forms[0].provider.entityId).toBe('pikachu')
    expect(pikachuFamily.forms[0].provider.metadata?.evolutionChainId).toBe(10)
    expect(pikachuFamily.forms[0].staticAsset?.key).toContain('pokeapi:pokemon:pikachu')
    expect(pikachuFamily.forms[0].animatedAsset?.variant).toBe('animated')
  })

  it('gives every entry a complete, renderable shape', () => {
    // A half-written entry is worse than a missing one: it validates as long as the fields
    // exist, then renders as a broken image or an empty progression. These are the
    // invariants the expansion had to satisfy.
    for (const entry of PROTOTYPE_COMPANION_CATALOG.list()) {
      expect(entry.forms.length, `${entry.id} needs forms`).toBeGreaterThan(0)
      expect(entry.progression[0].threshold, `${entry.id} must start at 0`).toBe(0)
      expect(entry.encounterTags.length, `${entry.id} needs encounter tags`).toBeGreaterThan(0)
      expect(
        entry.preferredLanguages.length + entry.preferredFileTypes.length,
        `${entry.id} needs at least one matching signal`,
      ).toBeGreaterThan(0)
      for (const form of entry.forms) {
        // Both variants: the reduced-motion still-image swap needs something to swap to,
        // and a missing animated key would make the animated path a silent 404.
        expect(form.animatedAsset, `${entry.id}/${form.id} needs an animated asset`).toBeDefined()
        expect(form.staticAsset, `${entry.id}/${form.id} needs a static asset`).toBeDefined()
        expect(form.animatedAsset!.key).toContain(`pokeapi:pokemon:${form.provider.entityId}`)
        // Above 649 there is no generation-v animated sprite, so such a form would render
        // still while advertising itself as animated.
        expect(Number(form.provider.formId), `${entry.id}/${form.id} id must be <= 649`).toBeLessThanOrEqual(649)
      }
    }
  })

  it('spreads across every rarity so one tier cannot dominate a draw', () => {
    const rarities = new Set(PROTOTYPE_COMPANION_CATALOG.list().map((entry) => entry.rarity))
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const) {
      expect(rarities, `no ${rarity} entry`).toContain(rarity)
    }
  })

  it('resolves base, evolved, and max progression without inventing stages', () => {
    const definition = PROTOTYPE_COMPANION_CATALOG.get('pikachu-family')!
    expect(resolveCompanionProgression(definition, 0).form.id).toBe('base')
    expect(resolveCompanionProgression(definition, 50).nextStep?.id).toBe('evolved')
    expect(resolveCompanionProgression(definition, 100).step.id).toBe('evolved')
    expect(resolveCompanionProgression(definition, 100).progress).toBe(1)
    expect(resolveCompanionProgression(definition, 100).form.name).toBe('Raichu')
  })

  it('rejects duplicate identities and invalid progression references', () => {
    const valid = PROTOTYPE_COMPANION_CATALOG.get('pikachu-family')!
    expect(() => createCompanionCatalog([valid, valid])).toThrow(/duplicate companion ID/)

    const invalid: CompanionDefinition = {
      ...valid,
      id: 'invalid',
      progression: [{ ...valid.progression[0], formId: 'missing' }],
    }
    expect(() => createCompanionCatalog([invalid])).toThrow(/references missing form/)
  })

  it('requires explicit form kinds and strictly increasing thresholds', () => {
    const valid = PROTOTYPE_COMPANION_CATALOG.get('pikachu-family')!
    const wrongKind: CompanionDefinition = {
      ...valid,
      id: 'wrong-kind',
      progression: [
        { ...valid.progression[0] },
        { ...valid.progression[1], kind: 'mastery' },
      ],
    }
    expect(() => createCompanionCatalog([wrongKind])).toThrow(/kind must match/)

    const repeatedThreshold: CompanionDefinition = {
      ...valid,
      id: 'repeated-threshold',
      progression: [
        { ...valid.progression[0] },
        { ...valid.progression[1], threshold: 0 },
      ],
    }
    expect(() => createCompanionCatalog([repeatedThreshold])).toThrow(/strictly increasing/)
  })
})
