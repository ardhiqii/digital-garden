'use client'

import { useEffect, useState } from 'react'
import {
  browserProductStorage,
  ensureBrowserGuestProfile,
  loadBrowserEncounters,
  loadBrowserLedger,
} from '@/lib/game/product-browser-storage'
import { createProductState, type ProductState } from '@/lib/game/product-state'
import { PROTOTYPE_COMPANION_CATALOG } from '@/lib/game/companion-catalog'
import { TITLES, resolveTitle } from '@/lib/game/titles'
import { resolveAchievements } from '@/lib/game/achievements'

const RARITY_COLOR: Record<string, string> = {
  common: 'var(--ink-muted)',
  rare: 'var(--accent)',
  epic: '#8b5cf6',
  legendary: '#d97706',
}

const CATEGORY_LABEL: Record<string, string> = {
  craft: 'Craft',
  shipping: 'Shipping',
  consistency: 'Consistency',
  collection: 'Collection',
  meta: 'Meta',
}

/**
 * `/progression` — the title ladder and the achievement list.
 *
 * Both are pure derivations of the local ledger (see `titles.ts` and
 * `achievements.ts`), so this page reads the same browser storage every other
 * guest surface does and computes everything client-side. Nothing here is
 * uploaded and nothing is written back.
 */
export function ProgressionView() {
  const [state, setState] = useState<ProductState | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const storage = browserProductStorage()
    const profile = ensureBrowserGuestProfile(storage, 'pikachu-family')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(
      createProductState(
        profile,
        loadBrowserLedger(storage),
        loadBrowserEncounters(storage),
        PROTOTYPE_COMPANION_CATALOG,
      ),
    )
    setReady(true)
  }, [])

  if (!ready || !state) {
    return (
      <p className="font-data text-xs uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
        Reading your ledger…
      </p>
    )
  }

  const totalXp = state.companions.reduce((sum, companion) => sum + companion.xp, 0)
  const resolvedTitle = resolveTitle(totalXp)
  const achievements = resolveAchievements(state)
  const unlockedCount = achievements.filter((entry) => entry.unlocked).length

  // Group by category, preserving the unlocked-first order within each group.
  const byCategory = new Map<string, typeof achievements>()
  for (const entry of achievements) {
    const list = byCategory.get(entry.achievement.category) ?? []
    list.push(entry)
    byCategory.set(entry.achievement.category, list)
  }

  return (
    <div className="flex flex-col gap-14">
      {/* ---------------------------------------------------------- title */}
      <section aria-labelledby="title-heading">
        <p className="font-data text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--ink-muted)', letterSpacing: '0.15em' }}>
          Rank
        </p>
        <h2 id="title-heading" className="font-ui text-3xl font-semibold tracking-tighter leading-[1.05] mb-2">
          {resolvedTitle.title.name}
        </h2>
        <p className="font-prose text-sm mb-6" style={{ color: 'var(--ink-muted)' }}>
          {resolvedTitle.title.blurb}
          {resolvedTitle.nextTitle
            ? ` · ${resolvedTitle.xpIntoTier.toLocaleString()} / ${resolvedTitle.xpForNextTier?.toLocaleString()} xp to ${resolvedTitle.nextTitle.name}`
            : ' · highest rank reached'}
        </p>

        <ol className="flex flex-col gap-1">
          {TITLES.map((title) => {
            const reached = totalXp >= title.threshold
            const current = title.id === resolvedTitle.title.id
            return (
              <li
                key={title.id}
                className="font-data flex items-baseline justify-between gap-4 border-b py-2 text-xs"
                style={{ borderColor: 'var(--rule)', opacity: reached ? 1 : 0.45 }}
              >
                <span style={{ color: current ? 'var(--accent)' : 'var(--ink)' }}>
                  {title.tier}. {title.name}
                  {current ? ' · you are here' : ''}
                </span>
                <span style={{ color: 'var(--ink-muted)' }}>
                  {title.threshold.toLocaleString()} xp
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      {/* --------------------------------------------------- achievements */}
      <section aria-labelledby="achievements-heading">
        <p className="font-data text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--ink-muted)', letterSpacing: '0.15em' }}>
          Achievements
        </p>
        <h2 id="achievements-heading" className="font-ui text-3xl font-semibold tracking-tighter leading-[1.05] mb-2">
          {unlockedCount} of {achievements.length}
        </h2>
        <p className="font-prose text-sm mb-8" style={{ color: 'var(--ink-muted)' }}>
          Earned from the same activity that grows your companion. Nothing
          here reads note text, titles, or paths.
        </p>

        <div className="flex flex-col gap-10">
          {[...byCategory.entries()].map(([category, entries]) => (
            <div key={category}>
              <h3 className="font-data text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--ink-muted)' }}>
                {CATEGORY_LABEL[category] ?? category}
              </h3>
              <ul className="flex flex-col">
                {entries.map(({ achievement, unlocked, progress }) => (
                  <li
                    key={achievement.id}
                    className="flex flex-col gap-1 py-3 border-b"
                    style={{ borderColor: 'var(--rule)', opacity: unlocked ? 1 : 0.6 }}
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-ui text-sm font-medium">
                        {unlocked ? '◆ ' : '◇ '}
                        {achievement.name}
                      </span>
                      <span
                        className="font-data text-[10px] uppercase tracking-widest shrink-0"
                        style={{ color: RARITY_COLOR[achievement.rarity] }}
                      >
                        {achievement.rarity}
                      </span>
                    </div>
                    <p className="font-prose text-xs" style={{ color: 'var(--ink-muted)' }}>
                      {achievement.description}
                    </p>
                    {!unlocked && progress > 0 && (
                      <div className="mt-1 h-1 w-full" style={{ background: 'var(--rule)' }}>
                        <div
                          className="h-full"
                          style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--accent)' }}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
