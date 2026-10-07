'use client'

/**
 * The egg: a thing you open, rather than a line of text you read.
 *
 * WHY THE ANIMATION IS CSS AND SVG RATHER THAN A LIBRARY: the whole flow is one
 * element changing shape over ~2.5 seconds. A motion library would add a
 * dependency, a bundle, and a version to track for a keyframe sequence that fits
 * in a style tag, and this app has to build on a server with no memory headroom.
 *
 * WHY THE STAGES ARE DRIVEN BY TIMERS AND NOT BY `onAnimationEnd`: a user who
 * prefers reduced motion gets no animation at all, so no animation event would
 * ever fire and the egg would never open. The timers make the sequence proceed
 * whether or not anything is painted.
 *
 * WHY THE SPARK COLOUR COMES FROM THE SPECIES: opening five eggs and watching each
 * one glow a different colour is the payoff. A single palette for every egg would
 * make the reveal a formality.
 */

import { useEffect, useState } from 'react'
import { EggShell } from '@/components/game/EggShell'

/** The order the reveal moves through. `done` is the caller's cue to commit. */
export type HatchStage = 'idle' | 'shaking' | 'cracking' | 'burst' | 'revealed'

/** Milliseconds per stage. The sum is the length of the whole sequence. */
const STAGE_MS: Readonly<Record<Exclude<HatchStage, 'idle'>, number>> = {
  shaking: 900,
  cracking: 450,
  burst: 500,
  revealed: 700,
}

const NEXT: Readonly<Record<HatchStage, HatchStage>> = {
  idle: 'shaking',
  shaking: 'cracking',
  cracking: 'burst',
  burst: 'revealed',
  revealed: 'revealed',
}

/** Species accent colours. Falls back to the app accent for an unknown species. */
const SHELL_COLOURS: Readonly<Record<string, string>> = {
  'pikachu-family': '#e8b23a',
  'ditto-like': '#a78bfa',
}

export interface EggHatchProps {
  /** Catalog id, which picks the shell colours and the spark. */
  companionId: string
  /** Shown once the shell is open. */
  companionName: string
  /** Called once the sequence has finished, so the caller can commit the hatch. */
  onHatched: () => void
  /** Optional: lets the user skip the animation. */
  skippable?: boolean
}

export function EggHatch({
  companionId,
  companionName,
  onHatched,
  skippable = true,
}: EggHatchProps) {
  const [stage, setStage] = useState<HatchStage>('idle')
  const shell = SHELL_COLOURS[companionId] ?? 'var(--accent)'

  useEffect(() => {
    if (stage === 'idle') return
    if (stage === 'revealed') {
      // Give the reveal a beat before the caller swaps in the collection tile.
      const done = setTimeout(onHatched, STAGE_MS.revealed)
      return () => clearTimeout(done)
    }
    const next = setTimeout(() => setStage(NEXT[stage]), STAGE_MS[stage as Exclude<HatchStage, 'idle'>])
    return () => clearTimeout(next)
  }, [stage, onHatched])

  const open = () => setStage((current) => (current === 'idle' ? 'shaking' : current))

  // The sequence starts on mount, not on a second click.
  //
  // WHY: the tile is already a button that the user pressed to get here, so
  // asking them to press "Open it" as well made opening an egg two taps with an
  // unexplained second prompt in between. The stage machine still exists because
  // the timers drive it; there is just no idle pause inside this component.
  useEffect(() => {
    setStage('shaking')
  }, [])

  const cracking = stage === 'cracking' || stage === 'burst' || stage === 'revealed'
  const burst = stage === 'burst' || stage === 'revealed'

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <style>{`
        /* Respect the system setting: no motion, but the sequence still runs on
           its timers so the egg still opens. */
        @media (prefers-reduced-motion: reduce) {
          .egg-anim, .egg-burst { animation: none !important; }
        }
        @keyframes egg-rock {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-9deg); }
          40% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          80% { transform: rotate(4deg); }
        }
        @keyframes egg-burst {
          0%   { opacity: 0; transform: scale(0.4); }
          40%  { opacity: 0.85; }
          100% { opacity: 0; transform: scale(2.6); }
        }
        @keyframes egg-rise {
          0%   { opacity: 0; transform: translateY(10px) scale(0.85); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div className="relative flex h-40 w-40 items-center justify-center">
        {/* The spark. Sits behind the shell so the light spills out from inside. */}
        {burst && (
          <div
            className="egg-burst pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${shell}cc 0%, ${shell}55 40%, transparent 70%)`,
              animation: 'egg-burst 900ms ease-out forwards',
            }}
            aria-hidden="true"
          />
        )}

        {!burst && (
          <button
            type="button"
            onClick={open}
            disabled={stage !== 'idle'}
            aria-label={stage === 'idle' ? 'Open the egg' : 'Opening'}
            className="egg-anim relative h-28 w-24 focus:outline-none"
            style={{
              animation: stage === 'shaking' ? 'egg-rock 900ms ease-in-out infinite' : undefined,
              transformOrigin: '50% 85%',
              cursor: stage === 'idle' ? 'pointer' : 'default',
            }}
          >
            <div className="absolute inset-0">
              <EggShell shell={shell} size={96} />
            </div>
            {/* Cracks, laid over the shell and appearing one after another as the
                stage advances. A second SVG rather than a modified shell, so the
                shell stays a pure, importable component. */}
            {cracking && (
              <svg viewBox="0 0 96 120" className="absolute inset-0 h-full w-full">
                <g stroke="#1c1917" strokeWidth="2.5" fill="none" strokeLinecap="round">
                  <path d="M48 18 L42 38 L54 50 L44 66" opacity="0.85" />
                  {burst && <path d="M44 66 L60 78 L52 96" opacity="0.85" />}
                </g>
              </svg>
            )}
          </button>
        )}

        {stage === 'revealed' && (
          <p
            className="font-ui text-lg font-semibold"
            style={{ animation: 'egg-rise 300ms ease-out forwards', color: shell }}
          >
            {companionName}
          </p>
        )}
      </div>

      {stage === 'idle' ? (
        <button
          type="button"
          onClick={open}
          className="ui-row font-ui px-4 py-2 text-sm border transition-opacity hover:opacity-80"
          style={{ borderColor: 'var(--ink)', color: 'var(--ink)' }}
        >
          Open it
        </button>
      ) : (
        <p className="font-data text-xs uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
          {stage === 'revealed' ? 'Hatched' : 'Hatching…'}
        </p>
      )}

      {skippable && stage !== 'idle' && stage !== 'revealed' && (
        <button
          type="button"
          onClick={() => setStage('revealed')}
          className="font-data text-[10px] uppercase tracking-widest hover:opacity-70"
          style={{ color: 'var(--ink-muted)' }}
        >
          Skip
        </button>
      )}
    </div>
  )
}
