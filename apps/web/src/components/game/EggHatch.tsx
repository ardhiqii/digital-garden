'use client'

/**
 * The hatch: tap the shell until it gives, and watch what was inside.
 *
 * WHY THIS IS A MODAL AND NOT AN INLINE PANEL: the reveal is the one moment in the app
 * that is worth taking over the screen for. Inline, the egg competed with the inventory
 * grid behind it and the user could scroll away mid-animation. A modal also gives the
 * egg the empty space the reference art depends on — a small sprite on a busy page reads
 * as a thumbnail, not as a specimen.
 *
 * WHY THE CRACK IS DRIVEN BY TAPS AND THE BURST BY TIMERS:
 *   - The cracking is the user's, so it waits for them. Each tap widens the visible
 *     window over one zigzag path (`crackWindow`), so the crack grows outward from the
 *     middle of the shell until it spans the whole egg. The count is fixed per egg by
 *     `crackCountFor`, so a re-render cannot heal a part-cracked egg.
 *   - Everything after the shell gives is a timer. A user who prefers reduced motion
 *     gets no animation at all, so an `onAnimationEnd` handler would never fire and the
 *     reveal would stall with the companion half-emerged. Timers advance the phases
 *     regardless of what is painted; the CSS only decides whether the motion is SEEN.
 *     This is the same rule the previous version of this file learned the hard way.
 *
 * WHY THE SPIN ENDS ON A MULTIPLE OF 360: the phase change has to be invisible. Landing
 * the last keyframe on 1080deg means the companion is already upright when the animation
 * is removed, so settling is a stop rather than a snap.
 *
 * WHY THE COMMIT HAPPENS BEFORE THE SPIN: `onHatched` removes the egg from the inventory,
 * and the inventory is rendered from the profile. If the commit waited until the modal
 * closed, a user who closed early would keep an egg they had already opened. The parent
 * owns this overlay's lifetime precisely so that removing the egg does not unmount it.
 */

import { useCallback, useEffect, useState } from 'react'
import { EggShell } from '@/components/game/EggShell'
import { crackCountFor, crackReveal, eggAccentFor } from '@/lib/game/egg-art'
import { companionSprite } from '@/lib/game/companion-sprite'

export interface EggHatchProps {
  /** Catalog id, which picks the shell accent and the sprite. */
  companionId: string
  /** Shown once the shell is open. */
  companionName: string
  /** The egg's own id. Its hash decides how many taps this shell takes. */
  drawId: string
  /**
   * Called the moment the shell breaks, so the egg leaves the inventory while the
   * companion is still arriving. Committing later would let an early close bank an
   * egg the user has already opened.
   */
  onHatched: () => void
  /** Called when the user dismisses the overlay. */
  onClose: () => void
}

/** Where the reveal is. `cracking` waits for the user; the rest are on timers. */
export type HatchPhase = 'cracking' | 'burst' | 'spinning' | 'settled'

const BURST_MS = 620
const SPIN_MS = 3000

/**
 * The pieces the shell breaks into.
 *
 * Fixed rather than random so the burst is the same on every render and needs no
 * hydration guard. The values are hand-tuned: near pieces travel less and rotate less
 * than far ones, which is what reads as an explosion with depth rather than a puff.
 */
const SHARDS: readonly { angle: number; distance: number; rotate: number; delay: number }[] = [
  { angle: -8, distance: 150, rotate: -220, delay: 0 },
  { angle: 42, distance: 132, rotate: 180, delay: 18 },
  { angle: 88, distance: 156, rotate: 260, delay: 6 },
  { angle: 134, distance: 128, rotate: -200, delay: 26 },
  { angle: 180, distance: 148, rotate: 240, delay: 12 },
  { angle: 226, distance: 136, rotate: -180, delay: 30 },
  { angle: 268, distance: 152, rotate: 220, delay: 4 },
  { angle: 316, distance: 126, rotate: -240, delay: 22 },
]

export function EggHatch({ companionId, companionName, drawId, onHatched, onClose }: EggHatchProps) {
  const accent = eggAccentFor(companionId, '#e8b23a')
  const requiredTaps = crackCountFor(drawId)
  const [taps, setTaps] = useState(0)
  const [phase, setPhase] = useState<HatchPhase>('cracking')
  const sprite = companionSprite(companionId)

  // The shell gives on the tap that completes the crack, not on a timer: the user is
  // the one opening it, and the commit should land with their gesture.
  const tapShell = useCallback(() => {
    if (phase !== 'cracking') return
    setTaps((current) => {
      const next = current + 1
      if (next >= requiredTaps) {
        setPhase('burst')
        onHatched()
      }
      return next
    })
  }, [phase, requiredTaps, onHatched])

  useEffect(() => {
    if (phase !== 'burst') return
    const toSpin = setTimeout(() => setPhase('spinning'), BURST_MS)
    return () => clearTimeout(toSpin)
  }, [phase])

  useEffect(() => {
    if (phase !== 'spinning') return
    const toSettled = setTimeout(() => setPhase('settled'), SPIN_MS)
    return () => clearTimeout(toSettled)
  }, [phase])

  // Escape closes while the user is cracking or after everything has settled. It is
  // deliberately inert mid-burst: the commit has already happened, and closing then
  // would hide the companion the user just paid taps for.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (phase === 'cracking' || phase === 'settled') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  // A modal over a scrolling page should hold the page still, or the background moves
  // under the user's thumb while they tap and the tap lands somewhere else.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const reveal = crackReveal(taps, requiredTaps)
  const shattered = phase === 'burst' || phase === 'spinning' || phase === 'settled'
  const showCompanion = phase === 'spinning' || phase === 'settled'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Opening an egg: ${companionName}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8, 8, 10, 0.82)', backdropFilter: 'blur(3px)' }}
      onClick={(event) => {
        // Only the backdrop itself dismisses; a click that started on the egg and ended
        // on the backdrop is a drag, not a dismissal.
        if (event.target === event.currentTarget && (phase === 'cracking' || phase === 'settled')) {
          onClose()
        }
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .egg-shard, .egg-flash, .egg-spin { animation: none !important; }
        }
        @keyframes egg-shard-fly {
          0%   { opacity: 1; transform: translate(-50%, -50%) rotate(0deg) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)) scale(0.7); }
        }
        @keyframes egg-flash {
          0%   { opacity: 0; transform: scale(0.3); }
          35%  { opacity: 0.9; }
          100% { opacity: 0; transform: scale(2.4); }
        }
        /* Eases out, so it reads as "spinning down" rather than stopping dead. Lands on
           1080deg = three whole turns, which is the same orientation it started in. */
        @keyframes egg-spin {
          0%   { opacity: 0; transform: scale(0.35) rotate(0deg); }
          25%  { opacity: 1; }
          100% { opacity: 1; transform: scale(1) rotate(1080deg); }
        }
        @keyframes egg-settle-in {
          0%   { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
      `}</style>

      <div
        className="relative flex w-full max-w-md flex-col items-center"
        style={{
          background: 'var(--paper-raised)',
          border: '1px solid var(--rule)',
          padding: '2.5rem 1.5rem 2rem',
        }}
      >
        {/* The decorative frame from the reference: the same sprite, repeated and faded,
            so the border is made of the thing it is framing. Decorative only, hence
            aria-hidden and a low opacity. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 flex justify-center gap-6 opacity-[0.07]"
          style={{ transform: 'translateY(-48%)' }}
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <EggShell key={index} shell={accent} size={28} />
          ))}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-6 opacity-[0.07]"
          style={{ transform: 'translateY(48%)' }}
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <EggShell key={index} shell={accent} size={28} />
          ))}
        </div>

        <div className="relative flex h-72 w-full items-center justify-center">
          {/* The light from inside. Rendered behind the shell so it spills past the
              shards rather than covering them. */}
          {shattered && (
            <div
              aria-hidden="true"
              className="egg-flash pointer-events-none absolute h-40 w-40 rounded-full"
              style={{
                background: `radial-gradient(circle, ${accent}f2 0%, ${accent}80 42%, transparent 72%)`,
                animation: 'egg-flash 900ms ease-out forwards',
              }}
            />
          )}

          {!shattered && (
            <button
              type="button"
              onClick={tapShell}
              aria-label={
                taps === 0 ? 'Tap the egg to start cracking it' : `${requiredTaps - taps} taps left`
              }
              className="relative h-52 w-44 focus:outline-none"
              style={{ cursor: 'pointer' }}
            >
              <EggShell shell={accent} size={176} reveal={reveal} alt="" />
            </button>
          )}

          {shattered &&
            SHARDS.map((shard, index) => {
              const radians = (shard.angle * Math.PI) / 180
              return (
                <span
                  key={index}
                  aria-hidden="true"
                  className="egg-shard pointer-events-none absolute left-1/2 top-1/2 block h-4 w-4"
                  style={
                    {
                      background: index % 2 === 0 ? '#f7eeda' : '#d8c49b',
                      border: '1px solid var(--sprite-outline)',
                      '--dx': `${Math.cos(radians) * shard.distance}px`,
                      '--dy': `${Math.sin(radians) * shard.distance}px`,
                      '--rot': `${shard.rotate}deg`,
                      animation: `egg-shard-fly 780ms cubic-bezier(0.22, 0.9, 0.3, 1) ${shard.delay}ms forwards`,
                    } as React.CSSProperties
                  }
                />
              )
            })}

          {showCompanion && sprite && (
            // eslint-disable-next-line @next/next/no-img-element -- animated GIF; see RemoteSprite
            <img
              src={sprite.animated ?? sprite.still}
              alt={companionName}
              width={176}
              height={176}
              className="egg-spin relative h-44 w-44"
              style={{
                imageRendering: 'pixelated',
                animation:
                  phase === 'spinning'
                    ? `egg-spin ${SPIN_MS}ms cubic-bezier(0.16, 0.62, 0.3, 1) forwards`
                    : 'egg-settle-in 340ms ease-out',
              }}
            />
          )}
        </div>

        {phase === 'cracking' && (
          <>
            <p className="font-ui mt-2 text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {taps === 0 ? 'Tap the shell' : 'Keep tapping'}
            </p>
            <p
              className="font-data mt-2 text-xs uppercase tracking-widest"
              style={{ color: 'var(--ink-muted)' }}
            >
              {requiredTaps - taps} {requiredTaps - taps === 1 ? 'tap' : 'taps'} to go
            </p>
          </>
        )}

        {phase === 'burst' && (
          <p className="font-data mt-2 text-xs uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
            Cracking open
          </p>
        )}

        {(phase === 'spinning' || phase === 'settled') && (
          <>
            <p className="font-ui mt-2 text-xl font-semibold tracking-tight" style={{ color: accent }}>
              {companionName}
            </p>
            <p className="font-data mt-2 text-xs uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
              {phase === 'spinning' ? 'Arriving' : 'Your companion'}
            </p>
          </>
        )}

        {phase === 'settled' && (
          <button
            type="button"
            onClick={onClose}
            className="ui-row font-ui mt-5 border px-4 py-2 text-sm transition-opacity hover:opacity-80"
            style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}
          >
            Keep it
          </button>
        )}

        {phase === 'cracking' && (
          <button
            type="button"
            onClick={onClose}
            className="font-data mt-5 text-[10px] uppercase tracking-widest hover:opacity-70"
            style={{ color: 'var(--ink-muted)' }}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  )
}
