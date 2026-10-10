/**
 * The unopened egg shell: a pixel sprite built from `egg-art.ts`.
 *
 * WHY THIS IS A PURE COMPONENT AND NOT SERVER-RENDERED LIKE THE SPRITES: it draws only
 * SVG primitives and imports nothing that reaches a Node built-in. It therefore renders
 * on the server AND inside the client bundle, which is what lets the same component
 * appear on `/companions` (server) and inside the hatch overlay (client). `CreatureSprite`
 * cannot do that — it reaches `node:fs` through the sprite source layer — which is why
 * the companion sprite is passed in as a prop instead.
 *
 * WHY ONE `<rect>` PER PIXEL AND NOT A PATH: the whole point of the reference art is
 * that the curvature is STEPPED. A path with curves renders smooth at any size, and a
 * path that traces the steps is unreadable in source. One rect per block makes the
 * source look like the picture, and `shapeRendering="crispEdges"` keeps the blocks
 * square once scaled.
 *
 * THE CRACK IS A SEPARATE OVERLAY, not a variant of the shell, so a partly-open egg is
 * still the same component with a different prop rather than a second sprite to keep in
 * step.
 */

import {
  EGG_CRACK_PATH,
  EGG_PALETTE,
  EGG_PIXELS,
  EGG_PIXEL_HEIGHT,
  EGG_PIXEL_WIDTH,
  crackWindow,
} from '@/lib/game/egg-art'

export interface EggShellProps {
  /** Accent colour for the crack, usually the species accent. */
  shell: string
  /** Rendered width in pixels. Height follows the sprite's aspect. Default 96. */
  size?: number
  /** 0 shows a whole shell, 1 a fully cracked one. Default 0. */
  reveal?: number
  /** Accessible label. Defaults to an unopened-egg description. */
  alt?: string
}

export function EggShell({ shell, size = 96, reveal = 0, alt }: EggShellProps) {
  const height = Math.round((size * EGG_PIXEL_HEIGHT) / EGG_PIXEL_WIDTH)
  const crack = crackWindow(reveal)
  const showCrack = reveal > 0

  return (
    <svg
      viewBox={`0 0 ${EGG_PIXEL_WIDTH} ${EGG_PIXEL_HEIGHT}`}
      width={size}
      height={height}
      shapeRendering="crispEdges"
      role="img"
      aria-label={alt ?? 'An unopened companion egg'}
    >
      {EGG_PIXELS.map((row, y) =>
        // One row becomes one group of rects. Index in the row is the x coordinate, so
        // an author can count characters against the picture instead of decoding a path.
        row
          .split('')
          .map((key, x) =>
            key === '.' ? null : (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1}
                height={1}
                fill={EGG_PALETTE[key] ?? EGG_PALETTE.B}
              />
            ),
          ),
      )}

      {showCrack && (
        <path
          d={EGG_CRACK_PATH}
          // Normalised so the dash maths is a fraction of the path and does not have to
          // know its real length.
          pathLength={1}
          fill="none"
          stroke={shell}
          strokeWidth={0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={crack.dashArray}
          strokeDashoffset={crack.dashOffset}
        />
      )}
    </svg>
  )
}
