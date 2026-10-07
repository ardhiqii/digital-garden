/**
 * The unopened egg shell.
 *
 * WHY THIS IS A PURE COMPONENT AND NOT SERVER-RENDERED LIKE THE SPRITES: it draws
 * only SVG primitives and imports nothing. It therefore carries no Node built-ins,
 * so a client component can import it directly. `CreatureSprite` cannot (it reaches
 * `node:fs` through the sprite source layer) and is passed in as data instead. The
 * difference is worth stating because the rule is "no Node built-ins in the client
 * bundle", not "nothing may be imported".
 *
 * WHY THE COLOURS ARE PASSED IN RATHER THAN LOOKED UP: the caller already knows the
 * species, and a lookup table here would be a second place to keep species colours
 * in step with the sprite source.
 */

export interface EggShellProps {
  /** Body colour, usually the species accent. */
  shell: string
  /** Rendered size in pixels. Default 96. */
  size?: number
}

export function EggShell({ shell, size = 96 }: EggShellProps) {
  const height = Math.round(size * 1.25)
  return (
    <svg
      viewBox="0 0 96 120"
      width={size}
      height={height}
      role="img"
      aria-label="An unopened companion egg"
    >
      <defs>
        <linearGradient id={`egg-${shell.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="55%" stopColor={shell} stopOpacity="0.9" />
          <stop offset="100%" stopColor={shell} stopOpacity="1" />
        </linearGradient>
      </defs>
      <ellipse cx="48" cy="62" rx="38" ry="52" fill={`url(#egg-${shell.replace(/[^a-zA-Z0-9]/g, '')})`} />
      <ellipse cx="34" cy="42" rx="10" ry="16" fill="#ffffff" opacity="0.5" />
      <ellipse cx="60" cy="80" rx="6" ry="9" fill="#ffffff" opacity="0.22" />
    </svg>
  )
}
