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
import { namespaceFromProfileKey } from '@/lib/sync/viewer-profile-key'
import {
  loadBrowserEncounters,
  loadBrowserLedger,
  loadRevealedDraws,
  saveBrowserEncounters,
  saveBrowserLedger,
  saveRevealedDraws,
} from '@/lib/game/product-browser-storage'

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
 *
 * The derivation itself now lives in `viewer-profile-key`, beside `profileKeyFor`, so
 * the migration in `use-viewer-profile-key` and this component cannot disagree about
 * what a key's namespace is.
 */

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

function loadRevealedDrawsLocal(profileKey: string): string[] {
  return loadRevealedDraws(storage(), namespaceFromProfileKey(profileKey))
}

function saveRevealedDrawsLocal(ids: readonly string[], profileKey: string): void {
  saveRevealedDraws(storage(), ids, namespaceFromProfileKey(profileKey))
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

    setRevealedDraws(loadRevealedDrawsLocal(profileKey))

    const profile = currentProfile(profileKey)
    if (!profile) return

    // Hydrate from browser-local state after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(createProductState(profile, loadLedger(namespace), loadEncounters(namespace), PROTOTYPE_COMPANION_CATALOG))

    // THE DAILY DRAW used to be claimed here, which is why it only ever happened on
    // this route. It now runs in the shared session resolver
    // (`ensureViewerHasProfileAndDailyDraw`), which every route reaches through the
    // navbar — a user who lands on /companions, the page that lists the eggs, used to
    // find no egg, no badge and no profile at all.
    //
    // The profile is also guaranteed to exist by that resolver now, so `currentProfile`
    // above is always populated on a page that reached this point.

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
      if (profileKey) saveRevealedDrawsLocal(next, profileKey)
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
