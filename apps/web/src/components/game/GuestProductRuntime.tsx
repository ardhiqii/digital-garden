'use client'

import { useEffect, useState } from 'react'
import { ProductActivityPanel } from './ProductActivityPanel'
import { EncounterReveal } from './EncounterReveal'
import { CompanionSwitcher } from './CompanionSwitcher'
import {
  addEvents,
  type EventLedger,
  type NormalizedEvent,
} from '@/lib/game/events'
import {
  createEncounterState,
  type EncounterState,
  type EncounterSignals,
} from '@/lib/game/encounters'
import { PROTOTYPE_COMPANION_CATALOG } from '@/lib/game/companion-catalog'
import { claimDailyDraw, isDailyDrawDue } from '@/lib/game/daily-draw'
import { layEggs } from '@/lib/game/companion-eggs'
import {
    createProductState,
    applyProductEvents,
    applyEncounterDraws,
    switchActiveCompanion,
    type ProductState,
  } from '@/lib/game/product-state'
import {
  loadGuestProfile,
  saveGuestProfile,
  type GuestProfile,
} from '@/lib/game/guest-profile'
import { normalizeMarkdownEvents, type MarkdownFileSnapshot } from '@/lib/game/markdown-events'
import { MARKDOWN_SCAN_EVENT, type MarkdownScanDetail } from '@/lib/garden-fs/scan-dispatch'
import {
  loadScanSummaries,
  saveScanSummary,
  summarizeScanFiles,
} from '@/lib/game/scan-summary-store'
import { canonicalizeProductEvent } from '@/lib/sync/product-event-id'
import { useViewerProfileKey } from '@/lib/sync/use-viewer-profile-key'
import {
  loadBrowserEncounters,
  loadBrowserLedger,
  saveBrowserEncounters,
  saveBrowserLedger,
} from '@/lib/game/product-browser-storage'
import { GUEST_PROFILE_STORAGE_KEY } from '@/lib/game/guest-profile'

const REVEALED_DRAWS_KEY = 'terrarium:guest-revealed-draws'
const PROFILE_EVENT = 'terrarium:guest-profile-updated'
const LEGACY_PROFILE_EVENT = 'digital-garden:guest-profile-updated'
const LEGACY_SCAN_EVENT = 'digital-garden:markdown-scan'

interface BrowserStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function storage(): BrowserStorage {
  return window.localStorage
}

/**
 * The namespace for this viewer's product keys, or undefined when signed out.
 *
 * This component used to keep its own `loadLedger`/`saveLedger`/`loadEncounters`/
 * `saveEncounters` helpers with hard-coded bare keys, duplicating
 * `product-browser-storage` and ignoring the namespace every other surface uses. On a
 * signed-in browser `/write` therefore wrote XP to a profile that `/github` never
 * read, so work done here was invisible in the synced condition and never reached the
 * cloud backup.
 */
function namespaceFromProfileKey(profileKey: string): string | undefined {
  return profileKey === GUEST_PROFILE_STORAGE_KEY
    ? undefined
    : profileKey.slice(GUEST_PROFILE_STORAGE_KEY.length + 1)
}

function loadLedger(namespace?: string): EventLedger {
  return loadBrowserLedger(storage(), namespace)
}

function saveLedger(ledger: EventLedger, namespace?: string): void {
  saveBrowserLedger(storage(), ledger, namespace)
}

function loadEncounters(namespace?: string): EncounterState {
  return loadBrowserEncounters(storage(), namespace)
}

function saveEncounters(encounters: EncounterState, namespace?: string): void {
  saveBrowserEncounters(storage(), encounters, namespace)
}

function loadRevealedDraws(profileKey: string): string[] {
  try {
    const key = `${REVEALED_DRAWS_KEY}:${namespaceFromProfileKey(profileKey) ?? ''}`
    const parsed: unknown = JSON.parse(storage().getItem(key) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

function saveRevealedDraws(ids: readonly string[], profileKey: string): void {
  const ns = namespaceFromProfileKey(profileKey)
  const key = ns ? `${REVEALED_DRAWS_KEY}:${ns}` : REVEALED_DRAWS_KEY
  storage().setItem(key, JSON.stringify(ids))
}

function currentProfile(profileKey: string): GuestProfile | null {
  try {
    return loadGuestProfile(storage(), profileKey)
  } catch {
    return null
  }
}

function signalsFromFiles(files: readonly MarkdownFileSnapshot[]): EncounterSignals {
  const fileTypes = [
    ...new Set(
      files
        .map((file) => file.path.split('.').pop()?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  return { fileTypes }
}

function recordBaseline(profile: GuestProfile, sourceId: string, files: readonly MarkdownFileSnapshot[]): GuestProfile {
  if (profile.sourceBaselines.some((baseline) => baseline.sourceId === sourceId)) return profile
  const timestamp = new Date().toISOString()
  const size = files.reduce((total, file) => total + file.content.length, 0)
  return {
    ...profile,
    updatedAt: timestamp,
    sourceBaselines: [
      ...profile.sourceBaselines,
      {
        sourceId,
        kind: 'notes',
        fingerprint: `local:${files.length}:${size}`,
        observedAt: timestamp,
        metrics: { noteCount: files.length },
      },
    ],
  }
}

export function GuestProductRuntime() {
  const [state, setState] = useState<ProductState | null>(null)
  const profileKey = useViewerProfileKey()
  const [revealedDraws, setRevealedDraws] = useState<string[]>([])

  useEffect(() => {
    // Wait for the viewer's key. Everything below reads and writes the store this
    // key names, so running before it is known would read one profile and write
    // another. The namespace keeps this page on the same data as /github.
    if (!profileKey) return
    const namespace = namespaceFromProfileKey(profileKey)

    setRevealedDraws(loadRevealedDraws(profileKey))

    const profile = currentProfile(profileKey)
    if (!profile) return

    // Hydrate from browser-local state after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(createProductState(profile, loadLedger(namespace), loadEncounters(namespace), PROTOTYPE_COMPANION_CATALOG))

    // THE DAILY DRAW. Claimed on arrival, once per local calendar day, gated by
      // the day id being in `processedTriggerIds`. Deliberately here rather than
      // inside the scan handler: a user who opens the app but has no folder
      // mounted, or whose folder is unchanged, still gets their companion for
      // showing up. Hooking it to a scan would make the reward conditional on
      // writing, which is the opposite of what a daily login reward is for.
      {
        const encounters = loadEncounters(namespace)
        if (isDailyDrawDue(encounters, new Date())) {
          const claimed = claimDailyDraw(
            encounters,
            new Date(),
            PROTOTYPE_COMPANION_CATALOG,
            profile.collection.map((entry) => entry.companionId),
          )
          if (claimed.claimed) {
            saveEncounters(claimed.state, namespace)
            // The draw becomes an EGG, not a collection entry. A draw used to land
            // straight in the collection and announce itself in a panel the user
            // read; an egg is the same event with the user present for it. The
            // companion joins the collection when the egg is opened, so an
            // unhatched companion does not count toward the assignment bound.
            const withEggs = layEggs(profile, claimed.newDraws, new Date().toISOString())
            saveGuestProfile(storage(), withEggs, profileKey)
            window.dispatchEvent(new Event(PROFILE_EVENT))
            setState(createProductState(withEggs, loadLedger(namespace), claimed.state, PROTOTYPE_COMPANION_CATALOG))
          }
        }
      }

    const onProfileUpdated = () => {
      const nextProfile = currentProfile(profileKey)
      if (!nextProfile) return
      setState((current) =>
        createProductState(
          nextProfile,
          current?.ledger ?? loadLedger(namespace),
          current?.encounters ?? loadEncounters(namespace),
          PROTOTYPE_COMPANION_CATALOG,
        ),
      )
    }

    const onScan = (event: Event) => {
      const detail = (event as CustomEvent<MarkdownScanDetail>).detail
      if (!detail || !detail.sourceId || !Array.isArray(detail.files)) return
      const profile = currentProfile(profileKey)
      if (!profile) return

      // The scan's memory comes from storage, not from a ref. It used to live in
      // a `useRef`, so closing the tab discarded it and the next visit re-baselined
      // everything and awarded nothing: a user writing in Obsidian daily earned XP
      // for almost none of it. `null` means this folder has genuinely never been
      // seen, which is the only case that should baseline.
      const stored = loadScanSummaries(storage())[detail.sourceId] ?? null
      if (!stored) {
        // The first observation is the source baseline. Existing notes are
        // history for identity/context, not retroactive XP.
        const summary = {
          sourceId: detail.sourceId,
          observedAt: new Date().toISOString(),
          files: summarizeScanFiles(detail.files),
        }
        saveScanSummary(storage(), summary)
        const baselineProfile = recordBaseline(profile, detail.sourceId, detail.files)
        if (baselineProfile !== profile) {
          saveGuestProfile(storage(), baselineProfile)
          window.dispatchEvent(new Event(PROFILE_EVENT))
        }
        setState((current) => current ?? createProductState(baselineProfile, loadLedger(namespace), loadEncounters(namespace), PROTOTYPE_COMPANION_CATALOG))
        return
      }

      const normalized = normalizeMarkdownEvents({
        sourceId: detail.sourceId,
        companionId: profile.activeCompanionId,
        previous: stored.files,
        current: detail.files,
        // The scan's own time, from the clock. Daily caps bucket by this, never
        // by a file's mtime, which the user can set.
        now: new Date().toISOString(),
      })
      // Persist the new state of the folder BEFORE applying, so a scan that yields
      // no events still advances the memory. Otherwise the same "changed" diff
      // would be recomputed and re-offered on every visit.
      saveScanSummary(storage(), {
        sourceId: detail.sourceId,
        observedAt: new Date().toISOString(),
        files: summarizeScanFiles(detail.files),
      })
      if (normalized.length === 0) {
        setState((current) => current ?? createProductState(profile, loadLedger(namespace), loadEncounters(namespace), PROTOTYPE_COMPANION_CATALOG))
        return
      }

      setState((current) => {
        const base = current ?? createProductState(profile, loadLedger(namespace), loadEncounters(namespace), PROTOTYPE_COMPANION_CATALOG)
        const next = applyProductEvents(base, normalized, PROTOTYPE_COMPANION_CATALOG, {
          encounterSignals: signalsFromFiles(detail.files),
          triggerId: `scan:${detail.sourceId}:${normalized.map((item) => item.eventId).join('|')}`,
        })
        saveLedger(next.ledger, namespace)
        saveEncounters(next.encounters, namespace)
        return next
      })
    }

    window.addEventListener(PROFILE_EVENT, onProfileUpdated)
    window.addEventListener(MARKDOWN_SCAN_EVENT, onScan)
    window.addEventListener(LEGACY_PROFILE_EVENT, onProfileUpdated)
    window.addEventListener(LEGACY_SCAN_EVENT, onScan)
    return () => {
      window.removeEventListener(PROFILE_EVENT, onProfileUpdated)
      window.removeEventListener(MARKDOWN_SCAN_EVENT, onScan)
      window.removeEventListener(LEGACY_PROFILE_EVENT, onProfileUpdated)
      window.removeEventListener(LEGACY_SCAN_EVENT, onScan)
      }
      }, [profileKey])

  const dismissDraw = (drawId: string) => {
    setRevealedDraws((current) => {
      const next = current.includes(drawId) ? current : [...current, drawId]
      if (profileKey) saveRevealedDraws(next, profileKey)
      return next
    })
  }

  const makeActive = (companionId: string) => {
    if (!state || !profileKey) return
    const next = switchActiveCompanion(state, companionId, PROTOTYPE_COMPANION_CATALOG)
    if (next !== state && next.profile.activeCompanionId !== state.profile.activeCompanionId) {
      saveGuestProfile(storage(), next.profile, profileKey)
      window.dispatchEvent(new Event(PROFILE_EVENT))
      setState(next)
    }
  }

  if (!state) return null
  return (
    <>
      <EncounterReveal
        state={state}
        revealedIds={revealedDraws}
        onReveal={dismissDraw}
        onMakeActive={makeActive}
      />
      <ProductActivityPanel state={state} sourceLabel="Local companion" />
      <CompanionSwitcher state={state} onSwitch={makeActive} />
    </>
  )
}
