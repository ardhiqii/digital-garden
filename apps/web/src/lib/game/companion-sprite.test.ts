import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROTOTYPE_COMPANION_CATALOG, resolveCompanionProgression } from './companion-catalog'
import { hasMeasuredSize, resolveCompanionSprite, spriteIdForForm } from './companion-sprite'

/**
 * A collection tile must show its OWN companion, at its own measured size.
 *
 * WHAT WENT WRONG: every tile rendered one sprite -- the garden stage's sporeling -- because
 * the grid is a `'use client'` component and `CreatureSprite` reaches `node:fs`, so a single
 * server-rendered node was threaded through and used for all of them. A collection of
 * `pikachu-family` and `abra-line` rendered two identical grass lizards.
 */
describe('companion sprite resolution', () => {
  it('has a measured size for every form the catalog can render', () => {
    // The table is measured from each GIF's own header, not guessed. An entry added without
    // measuring its sprite must fail HERE rather than render stretched, which is what a
    // nominal square box would do to these non-square sprites.
    const missing: string[] = []
    for (const entry of PROTOTYPE_COMPANION_CATALOG.list()) {
      for (const form of entry.forms) {
        const id = spriteIdForForm(form)
        if (id === null || !hasMeasuredSize(id)) {
          missing.push(`${entry.id}/${form.id} (id=${form.provider.formId})`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('points at the sprite belonging to this companion, not a shared one', () => {
    const pikachu = resolveCompanionSprite(PROTOTYPE_COMPANION_CATALOG.get('pikachu-family')!)
    const abra = resolveCompanionSprite(PROTOTYPE_COMPANION_CATALOG.get('abra-line')!)
    expect(pikachu?.url).toContain('/animated/25.gif')
    expect(abra?.url).toContain('/animated/63.gif')
    expect(pikachu?.url).not.toEqual(abra?.url)
  })

  it('uses the measured box rather than a square, and offers a still fallback', () => {
    const gyarados = resolveCompanionSprite(PROTOTYPE_COMPANION_CATALOG.get('magikarp-line')!, 500)
    // Magikarp's evolved form, and one of the widest sprites in the catalog.
    expect(gyarados?.url).toContain('/animated/130.gif')
    expect(gyarados?.width).toBe(102)
    expect(gyarados?.height).toBe(84)
    expect(gyarados?.width).not.toBe(gyarados?.height)
    // The reduced-motion swap needs a real second image, not a style override.
    expect(gyarados?.staticUrl).toContain('/pokemon/130.png')
  })

  it('resolves the form the xp has reached, not always the base form', () => {
    const dratini = PROTOTYPE_COMPANION_CATALOG.get('dratini-line')!
    expect(resolveCompanionSprite(dratini, 0)?.url).toContain('/animated/147.gif')
    expect(resolveCompanionSprite(dratini, 250)?.url).toContain('/animated/148.gif')
    expect(resolveCompanionSprite(dratini, 900)?.url).toContain('/animated/149.gif')
    // The progression it agrees with is the catalog's own, not a second copy of the rule.
    expect(resolveCompanionProgression(dratini, 900).form.name).toBe('Dragonite')
  })

  it('refuses a malformed form id instead of requesting NaN.gif', () => {
    const dratini = PROTOTYPE_COMPANION_CATALOG.get('dratini-line')!
    const broken = {
      ...dratini.forms[0],
      provider: { providerId: 'pokeapi', entityId: 'dratini' },
    }
    expect(spriteIdForForm(broken)).toBeNull()
    expect(spriteIdForForm({ ...dratini.forms[0], provider: { providerId: 'pokeapi', entityId: 'dratini', formId: 'abc' } })).toBeNull()
  })

  it('is reachable from the client grid, which no longer shares one sprite', () => {
    const grid = readFileSync(join(__dirname, '..', '..', 'components', 'game', 'OwnedCompanionGrid.tsx'), 'utf8')
    expect(grid).toContain("from '@/lib/game/companion-sprite'")
    expect(grid).toContain('<RemoteSprite')
    // The exact markup that shared one sprite across every tile.
    expect(grid).not.toContain('{sprite}</div>')
    expect(grid).not.toMatch(/<div className="mb-2">\{sprite\}/)
  })
})
