/**
 * The egg sprite and the crack that opens it.
 *
 * WHY THESE ARE TESTS AND NOT JUST ART: a pixel sprite is a grid, and a grid whose rows
 * are not all the same width does not fail loudly — it renders a ragged right edge that
 * looks like a deliberate step, so it survives review and ships. The same is true of a
 * palette key typo: the block silently falls back to the body colour and the shape
 * quietly loses a pixel. Neither shows up in typecheck, and neither is visible in a diff.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  EGG_ACCENT_BY_COMPANION,
  EGG_CRACK_PATH,
  EGG_PALETTE,
  EGG_PIXELS,
  EGG_PIXEL_HEIGHT,
  EGG_PIXEL_WIDTH,
  crackCountFor,
  crackReveal,
  crackWindow,
  eggAccentFor,
} from './egg-art'
import { companionSprite } from './companion-sprite'

const WEB = path.join(__dirname, '..', '..', '..')

function read(relative: string): string {
  return readFileSync(path.join(WEB, relative), 'utf8')
}

describe('the egg sprite is a well-formed grid', () => {
  it('declares its own size truthfully', () => {
    // The viewBox is built from these two numbers. If they drift from the art, the
    // sprite is letterboxed or clipped and the pixel grid stops being square.
    expect(EGG_PIXELS.length).toBe(EGG_PIXEL_HEIGHT)
    for (const row of EGG_PIXELS) {
      expect(row.length, `row is ${row.length}, expected ${EGG_PIXEL_WIDTH}`).toBe(EGG_PIXEL_WIDTH)
    }
  })

  it('uses only keys the palette defines, plus transparency', () => {
    // A typo here is invisible: `EGG_PALETTE[key] ?? EGG_PALETTE.B` paints the block as
    // body colour and the shape loses a pixel without anything going red.
    for (const row of EGG_PIXELS) {
      for (const key of row) {
        if (key === '.') continue
        expect(Object.keys(EGG_PALETTE), `unknown palette key "${key}"`).toContain(key)
      }
    }
  })

  it('is closed: every row of the shell has an outline at both ends', () => {
    // The reference art has a one-pixel black outline all the way round. A gap is a hole
    // the background shows through, and it is one character wide.
    for (const row of EGG_PIXELS) {
      const first = row.search(/[^.]/)
      if (first === -1) continue
      const last = row.length - 1 - [...row].reverse().join('').search(/[^.]/)
      expect(row[first], `left edge of "${row}" is not an outline`).toBe('#')
      expect(row[last], `right edge of "${row}" is not an outline`).toBe('#')
    }
  })
})

describe('crackCountFor', () => {
  it('always asks for between three and five taps', () => {
    for (let index = 0; index < 200; index += 1) {
      const count = crackCountFor(`guest:${index}`)
      expect(count).toBeGreaterThanOrEqual(3)
      expect(count).toBeLessThanOrEqual(5)
    }
  })

  it('is stable for one egg, so a re-render cannot heal a part-cracked shell', () => {
    expect(crackCountFor('daily:2026-10-08')).toBe(crackCountFor('daily:2026-10-08'))
  })

  it('varies across eggs, so they do not all take the same number of taps', () => {
    const counts = new Set(Array.from({ length: 60 }, (_, index) => crackCountFor(`draw-${index}`)))
    expect(counts.size).toBeGreaterThan(1)
  })
})

describe('crackReveal', () => {
  it('grows from nothing to the whole crack', () => {
    expect(crackReveal(0, 4)).toBe(0)
    expect(crackReveal(2, 4)).toBe(0.5)
    expect(crackReveal(4, 4)).toBe(1)
  })

  it('clamps, so a double-tap cannot overshoot and a rewind cannot go negative', () => {
    expect(crackReveal(9, 4)).toBe(1)
    expect(crackReveal(-3, 4)).toBe(0)
  })

  it('does not divide by zero on a corrupt count', () => {
    expect(crackReveal(2, 0)).toBe(0)
  })
})

describe('crackWindow', () => {
  it('shows the whole path at full reveal', () => {
    const window = crackWindow(1)
    expect(window.dashArray).toBe('1 1')
    expect(window.dashOffset).toBe(-0)
  })

  it('centres the visible dash, which is what makes the crack start in the middle', () => {
    // Half revealed: the dash must begin a quarter of the way in, so the visible window
    // covers the middle half of the path rather than the first half.
    const window = crackWindow(0.5)
    expect(window.dashOffset).toBe(-0.25)
    expect(window.dashArray).toBe('0.5 1')
  })

  it('hides everything at zero', () => {
    expect(crackWindow(0).dashArray).toBe('0 1')
  })

  it('clamps out-of-range input rather than emitting a broken dash', () => {
    expect(crackWindow(4).dashArray).toBe('1 1')
    expect(crackWindow(-1).dashArray).toBe('0 1')
  })
})

describe('the crack lands on the shell', () => {
  it('stays inside the pixel grid', () => {
    // The path is authored in the same 16x20 space as the sprite. A coordinate outside
    // it draws the crack beside the egg, which reads as a rendering bug.
    const numbers = EGG_CRACK_PATH.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    expect(numbers.length).toBeGreaterThan(0)
    numbers.forEach((value, index) => {
      const limit = index % 2 === 0 ? EGG_PIXEL_WIDTH : EGG_PIXEL_HEIGHT
      expect(value, `coordinate ${value} is outside the ${limit}-unit grid`).toBeGreaterThanOrEqual(0)
      expect(value, `coordinate ${value} is outside the ${limit}-unit grid`).toBeLessThanOrEqual(limit)
    })
  })

  it('runs from the top of the shell to the bottom, not across it', () => {
    const numbers = EGG_CRACK_PATH.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    const ys = numbers.filter((_, index) => index % 2 === 1)
    const xs = numbers.filter((_, index) => index % 2 === 0)
    // Vertical span dominates: this is a crack splitting the egg, not a seam.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs))
  })
})

describe('eggAccentFor', () => {
  it('gives each catalog companion its own colour', () => {
    expect(eggAccentFor('pikachu-family')).toBe(EGG_ACCENT_BY_COMPANION['pikachu-family'])
    expect(eggAccentFor('ditto-like')).not.toBe(eggAccentFor('pikachu-family'))
  })

  it('falls back rather than returning undefined, which would make a crack invisible', () => {
    // `stroke={undefined}` renders no crack at all, which looks identical to an egg that
    // cannot be opened.
    expect(eggAccentFor('nobody')).toBe('#e8b23a')
    expect(eggAccentFor('nobody', '#123456')).toBe('#123456')
  })
})

describe('companionSprite', () => {
  it('resolves a catalog companion to real sprite URLs', () => {
    const sprite = companionSprite('pikachu-family')
    expect(sprite).not.toBeNull()
    expect(sprite?.still).toMatch(/^https:\/\/raw\.githubusercontent\.com\/.*\/25\.png$/)
    expect(sprite?.animated).toMatch(/25\.gif$/)
  })

  it('never builds a URL containing NaN', () => {
    // A malformed asset key used to be one `Number()` away from an <img src="...NaN.png">,
    // which renders as a broken-image icon inside the reveal.
    for (const definition of ['pikachu-family', 'ditto-like']) {
      const sprite = companionSprite(definition)
      expect(sprite?.still ?? '').not.toContain('NaN')
      expect(sprite?.animated ?? '').not.toContain('NaN')
    }
  })

  it('returns null for an unknown companion instead of guessing', () => {
    expect(companionSprite('nobody')).toBeNull()
  })
})

describe('the hatch overlay is owned by the grid, not by the egg tile', () => {
  const grid = read('src/components/game/OwnedCompanionGrid.tsx')

  it('renders EggHatch outside the egg list', () => {
    // `onHatched` removes the egg from the profile, which empties its own <li>. When the
    // overlay lived inside that tile it unmounted mid-spin — the companion vanished
    // about half a second into a three-second reveal.
    const hatch = grid.indexOf('<EggHatch')
    const listEnd = grid.lastIndexOf('</ul>')
    expect(hatch).toBeGreaterThan(listEnd)
  })

  it('commits on the tap that breaks the shell, not when the overlay closes', () => {
    const hatch = read('src/components/game/EggHatch.tsx')
    // The commit sits in the tap handler that reaches the required count. Moving it to
    // the close handler would let an early dismissal bank an egg already opened.
    expect(hatch).toContain('onHatched()')
    expect(hatch).toMatch(/next >= requiredTaps[\s\S]{0,120}onHatched\(\)/)
  })

  it('drives every post-tap phase on a timer, never on an animation event', () => {
    const hatch = read('src/components/game/EggHatch.tsx')
    // `prefers-reduced-motion` removes the CSS animations, so an animation-end handler
    // never fires and the reveal stalls with the companion half-emerged.
    //
    // Matched as an ATTRIBUTE and not as a word: the file's own docstring explains this
    // rule and names the handler, so a plain substring check fails on its own comment.
    expect(hatch).not.toMatch(/onAnimationEnd\s*=/)
    expect(hatch).toContain('setTimeout')
  })
})
