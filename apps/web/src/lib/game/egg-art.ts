/**
 * The pixel art for a companion egg, and the crack that opens it.
 *
 * WHY DATA AND NOT A DRAWN SVG: the reference is a chunky pixel sprite — few, large
 * blocks, one-pixel black outline, flat shading, no dithering. A grid of characters
 * is the shape that art is actually authored in, so it stays editable by looking at
 * it, and a test can assert every row is the same width. An SVG path cannot be
 * checked by reading it, and a pixel sprite drawn as curves is no longer pixel art.
 *
 * WHY THIS IS A PURE MODULE WITH NO IMPORTS: `EggShell` renders on the server and in
 * the client bundle, so nothing here may reach a Node built-in. Keeping the art in
 * `lib/` (rather than inside the component) is what lets the art and the crack maths
 * be unit-tested without a DOM.
 *
 * WHY THE EGG IS NEUTRAL CREAM AND GOLD: the species accent belongs to the CRACK and
 * the BURST, where it reads as the thing inside shining through. Tinting the whole
 * shell by species would make two eggs of the same species identical at a glance and
 * cost the reveal its surprise, which is the one moment the colour is for.
 */

/** Width of the pixel grid, in blocks. */
export const EGG_PIXEL_WIDTH = 16

/** Height of the pixel grid, in blocks. */
export const EGG_PIXEL_HEIGHT = 20

/**
 * Palette keys used by `EGG_PIXELS`. `.` is transparent.
 *
 * `image-rendering: pixelated` is not enough on its own — an SVG scaled up smooths
 * every edge unless the shapes land on the raster grid, which is why this is drawn as
 * one `<rect>` per block on an integer viewBox rather than as circles.
 *
 * WHY THE OUTLINE IS A CSS VARIABLE AND NOT A HEX: the reference art is a dark outline
 * on a light ground, and this app has a dark theme. A hardcoded near-black outline is
 * invisible against `--paper-raised` in dark mode, where the egg would lose the one
 * feature that makes it read as pixel art. `--sprite-outline` is the token the rest of
 * the sprite layer already flips per theme, so the egg inherits that behaviour instead
 * of needing a second one.
 */
export const EGG_PALETTE: Readonly<Record<string, string>> = {
  '#': 'var(--sprite-outline)',
  B: '#f7eeda',
  H: '#fffdf7',
  S: '#d8c49b',
}

/**
 * The egg, one character per pixel block.
 *
 * Read it as a picture: `#` is the outline, `H` the highlight on the upper left where
 * the light comes from, `B` the body, `S` the shading that wraps the lower right.
 */
export const EGG_PIXELS: readonly string[] = [
  '................',
  '......####......',
  '....##BBBB##....',
  '...#BBBBBBSS#...',
  '..#BBHHBBBBSSS#.',
  '..#BBHHBBBBSSS#.',
  '.#BBBHBBBBBBSSS#',
  '.#BBBBBBBBBBSSS#',
  '#BBBBBBBBBBBBSS#',
  '#BBBBBBBBBBBBSS#',
  '#BBBBBBBBBBBBSS#',
  '#BBBBBBBBBBBBSS#',
  '#BBBBBBBBBBBSSS#',
  '.#BBBBBBBBBSSSS#',
  '.#BBBBBBBBBSSSS#',
  '..#BBBBBBBSSSS#.',
  '..#BBBBBSSSSS#..',
  '...##BBSSSS##...',
  '.....######.....',
  '................',
]

/**
 * The full crack, as one zigzag from the top of the shell to the bottom.
 *
 * A single path rather than one per tap, because the reveal is a WINDOW over this
 * path (see `crackWindow`): the crack starts in the middle and grows outward in both
 * directions until it spans the whole egg, which is what the reveal is describing.
 * Separate per-tap paths would have to be hand-authored and could not be made to meet
 * at the ends.
 *
 * Coordinates are in the same 16x20 space as `EGG_PIXELS`, so the crack lands on the
 * shell rather than near it.
 */
export const EGG_CRACK_PATH = 'M8 2 L5 5 L11 8 L5 11 L11 14 L8 17'

/**
 * How many taps this egg takes to open: 3, 4, or 5.
 *
 * WHY DERIVED FROM THE DRAW ID AND NOT RANDOM: a re-render must not change the number
 * of taps left, or an egg would appear to heal itself. The draw id is stable for the
 * life of the egg, so hashing it gives a count that varies between eggs and never
 * within one.
 */
export function crackCountFor(drawId: string): number {
  let hash = 0
  for (let index = 0; index < drawId.length; index += 1) {
    hash = (hash * 31 + drawId.charCodeAt(index)) | 0
  }
  return 3 + (Math.abs(hash) % 3)
}

/**
 * How much of the crack to show after `taps` of `total`, as a 0..1 fraction.
 *
 * Clamped at both ends so a double-tap cannot overshoot past a full crack and a rewind
 * cannot produce a negative dash.
 */
export function crackReveal(taps: number, total: number): number {
  if (total <= 0) return 0
  const clamped = Math.min(Math.max(taps, 0), total)
  return clamped / total
}

export interface CrackWindow {
  /**
   * `stroke-dasharray`, with the path normalised to length 1. The gap is a full path
   * length so at most one dash is ever visible.
   */
  dashArray: string
  /** `stroke-dashoffset` that centres the visible dash on the path. */
  dashOffset: number
}

/**
 * The accent an egg glows in, by companion. Falls back to the app accent.
 *
 * It lives here, beside the art, so the tile and the hatch overlay cannot disagree about
 * what colour an egg is — they were reading two separate tables before.
 */
export const EGG_ACCENT_BY_COMPANION: Readonly<Record<string, string>> = {
  'pikachu-family': '#e8b23a',
  'ditto-like': '#a78bfa',
}

/** The accent for a companion, or the caller's fallback. */
export function eggAccentFor(companionId: string, fallback = '#e8b23a'): string {
  return EGG_ACCENT_BY_COMPANION[companionId] ?? fallback
}

/**
 * Turn a reveal fraction into the dash pair that shows the MIDDLE of the crack.
 *
 * The offset is negative half of what is hidden: showing a window of length `reveal`
 * centred on a path of length 1 means the dash has to begin at `(1 - reveal) / 2`, and
 * a dash pattern is shifted by the negative of where it should start.
 */
export function crackWindow(reveal: number): CrackWindow {
  const shown = Math.min(Math.max(reveal, 0), 1)
  return {
    dashArray: `${shown} 1`,
    dashOffset: -(1 - shown) / 2,
  }
}
