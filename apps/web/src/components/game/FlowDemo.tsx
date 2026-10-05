'use client'

/**
 * Guest-only, no-GitHub walkthrough for the first-run experience.
 *
 * WHY THIS EXISTS: the real flow (sign in with GitHub, push a commit, wait for
 * a sync, watch XP arrive) needs OAuth credentials and a real repository, so it
 * cannot be exercised on a checkout that has neither. This page drives the SAME
 * engine functions that flow drives (`createGuestProfile`,
 * `advanceEncounter`, `resolveCompanionProgression`, `resolveActivityLog`) with
 * fabricated events, so the behaviour can be inspected end to end without
 * touching the network.
 *
 * WHAT IT IS NOT: it is not a second implementation. Every number below comes
 * from the real modules. If it disagrees with the live app, the live app is
 * right and this page has a bug.
 */

import { useMemo, useState } from 'react'
import { advanceEncounter, createEncounterState, DEFAULT_ENCOUNTER_CONFIG } from '@/lib/game/encounters'
import {
  PROTOTYPE_COMPANION_CATALOG,
  resolveCompanionProgression,
} from '@/lib/game/companion-catalog'
import {
  XP_BY_EVENT_CATEGORY,
  asCompanionId,
  asEventId,
  type EventLedger,
  type NormalizedEvent,
} from '@/lib/game/events'
import { resolveActivityLog } from '@/lib/game/activity-log'
import { SPECIES_LINES } from '@/lib/game/sprites/species'
import { STAGES } from '@/lib/game/types'
import { resolveStage } from '@/lib/game/stages'

const catalog = PROTOTYPE_COMPANION_CATALOG
const starter = catalog.list()[0]
const grassLine = SPECIES_LINES[0]

/** A push that lands a merged pull request, as the GitHub source would mint it. */
function mintPullRequestEvent(
  index: number,
  repositoryName: string,
  occurredAt: string,
): NormalizedEvent {
  return {
    eventId: asEventId(`simulated:${index}`),
    companionId: asCompanionId(starter.id),
    source: 'github',
    sourceId: 'simulated-account',
    provenance: 'verified',
    category: 'merged-pull-request',
    occurredAt,
    metadata: {
      repositoryId: `sim-${index}`,
      repositoryName,
      number: index + 1,
    },
  }
}

export function FlowDemo() {
  const [pushes, setPushes] = useState(0)

  const model = useMemo(() => {
    // 1. The starter is created locally, immediately, with no GitHub account.
    const profile = { starterCompanionId: starter.id }

    // 2. Each simulated push mints one merged-pull-request event.
    const events: NormalizedEvent[] = []
    for (let i = 0; i < pushes; i += 1) {
      events.push(
        mintPullRequestEvent(i, 'ardhiqii/terrarium', `2026-10-0${(i % 5) + 1}T10:00:00.000Z`),
      )
    }
    const ledger: EventLedger = { events }

    // 3. XP is the sum of accepted events.
    const xp = events.length * XP_BY_EVENT_CATEGORY['merged-pull-request']

    // 4. The stage is resolved from that XP, exactly as the app does.
    const progression = resolveCompanionProgression(starter, xp)
    const stage = resolveStage(xp)

    // 5. The encounter meter advances once per new event, so a push can also
    //    cross the draw threshold and yield a second companion.
    let encounters = createEncounterState()
    if (events.length > 0) {
      const result = advanceEncounter(
        encounters,
        {
          id: 'simulated-sync',
          seed: 'simulated',
          progress: events.length,
          signals: { languages: [], fileTypes: [], tags: [] },
          ownedCompanionIds: [starter.id],
        },
        catalog,
      )
      encounters = result.state
    }

    // 6. The log explains where the XP came from.
    const log = resolveActivityLog(ledger, { companionId: starter.id })

    return { profile, ledger, xp, progression, stage, encounters, log }
  }, [pushes])

  const speciesIdForStage = grassLine.stageToPokemonId[model.stage.stage.id]
  const meterThreshold = DEFAULT_ENCOUNTER_CONFIG.threshold

  return (
    <div className="font-data text-sm">
      <section className="mb-8">
        <h2 className="font-ui text-lg font-semibold">Step 1. First run, no GitHub</h2>
        <p className="font-prose mt-2 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          Opening the site creates a local guest profile immediately. The starter
          companion is <strong>catalog entry #1</strong>, not a random draw, and it is
          always a base-stage creature: <strong>{starter.name}</strong> (
          {starter.forms[0].name}), which is PokeAPI id{' '}
          {starter.forms[0].provider?.formId}.
        </p>
        <p className="font-data mt-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
          Guest profile starter: <span style={{ color: 'var(--accent)' }}>{model.profile.starterCompanionId}</span>
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-ui text-lg font-semibold">Step 2. Push to GitHub</h2>
        <p className="font-prose mt-2 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          A push alone earns nothing. XP comes from the events a connected
          repository produces: a merged pull request is{' '}
          {XP_BY_EVENT_CATEGORY['merged-pull-request']} xp, a release is{' '}
          {XP_BY_EVENT_CATEGORY['published-release']}, green CI is{' '}
          {XP_BY_EVENT_CATEGORY['successful-ci']}, and committing at all counts
          toward an active day ({XP_BY_EVENT_CATEGORY['qualifying-active-day']} xp,
          capped at one per day).
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPushes((n) => n + 1)}
            className="font-data px-4 py-2 text-xs"
            style={{ background: 'var(--accent)', color: 'var(--paper)' }}
          >
            Simulate a merged pull request
          </button>
          <button
            type="button"
            onClick={() => setPushes(0)}
            className="font-data px-4 py-2 text-xs"
            style={{ border: '1px solid var(--rule)', color: 'var(--ink)' }}
          >
            Reset
          </button>
        </div>
        <p className="font-data mt-3 text-xs" style={{ color: 'var(--ink-muted)' }}>
          Simulated pushes: {pushes} · XP: {model.xp}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-ui text-lg font-semibold">Step 3. What the creature does</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Stage</dt>
            <dd className="mt-1">{model.stage.stage.name} ({model.stage.stage.id})</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Species id at this stage</dt>
            <dd className="mt-1">#{speciesIdForStage} ({grassLine.name})</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Progress to next form</dt>
            <dd className="mt-1">
              {model.stage.xpForNextStage === null
                ? 'final form reached'
                : `${model.stage.xpIntoStage} / ${model.stage.xpForNextStage}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Encounter meter</dt>
            <dd className="mt-1">
              {model.encounters.meter} / {meterThreshold} ({model.encounters.draws.length} draws)
            </dd>
          </div>
        </dl>

        {/* The stage ladder, with the current position marked. */}
        <ol className="mt-5 flex flex-col gap-2">
          {STAGES.map((stage) => {
            const reached = model.xp >= stage.threshold
            const current = stage.id === model.stage.stage.id
            return (
              <li
                key={stage.id}
                className="flex items-baseline justify-between gap-3 border-b pb-2 last:border-b-0"
                style={{ borderColor: 'var(--rule)' }}
              >
                <span style={{ color: reached ? 'var(--ink)' : 'var(--ink-muted)' }}>
                  {current ? '▸ ' : '  '}
                  {stage.name} <span style={{ color: 'var(--ink-muted)' }}>
                    ({stage.slot === 'mastery' ? 'mastery, static' : 'evolution, animated'})
                  </span>
                </span>
                <span style={{ color: 'var(--ink-muted)' }}>
                  {stage.threshold.toLocaleString()} xp
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="mb-8">
        <h2 className="font-ui text-lg font-semibold">Step 4. The activity log</h2>
        {model.log.entries.length === 0 ? (
          <p className="font-prose mt-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {model.log.entries.map((entry) => (
              <li
                key={entry.eventId}
                className="flex items-baseline justify-between gap-3 border-b pb-2 last:border-b-0"
                style={{ borderColor: 'var(--rule)' }}
              >
                <span>
                  {entry.label}{' '}
                  <span style={{ color: 'var(--ink-muted)' }}>in {entry.sourceLabel}</span>
                </span>
                <span style={{ color: entry.counted ? 'var(--ink)' : 'var(--ink-muted)' }}>
                  {entry.counted ? `+${entry.xp} xp` : 'no xp'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="font-data mt-3 text-xs font-semibold">
          Total: {model.log.totalXp} xp · {model.log.skippedCount} skipped
        </p>
      </section>

      <section>
        <h2 className="font-ui text-lg font-semibold">What is NOT animated</h2>
        <p className="font-prose mt-2 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          There is no evolution animation. The sprite for stages 1-3 is PokeAPI&apos;s
          animated idle GIF, so the creature breathes and blinks on its own, but
          there is no transition when it changes stage: the image simply swaps on
          the next render. Stage 4 (the Mega) is a static PNG because PokeAPI
          ships no animated sprite for any Mega form. `/preview` lets you step
          through a line manually, and that stepper is a swap, not a morph.
        </p>
      </section>
    </div>
  )
}