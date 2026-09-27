# Progression: Titles & Achievements

> Spec for a feature that adds two things built on the **existing** event
> ledger: **titles** (a named rank that climbs with XP, like Git City's 25
> levels) and **achievements** (one-off unlocks for milestones).
>
> Reference: `docs/REFERENCE-git-city.md` (feature comparison). This spec takes
> the *mechanics* from that reference, not its privacy model or its monetized
> features.

Status: **proposed — awaiting approval before implementation.**

---

## 1. Why

Terrarium already has XP, stages, encounters, and Essence. What it lacks is
**naming** what a user has done. Right now progress is a number and a sprite
stage; there is no "you are a Botanist", no "you shipped your first release",
no visible set of things to aim at.

Two problems this solves:

1. **XP is not legible.** PRODUCT.md wants XP to be explainable. A ladder of
   named titles plus per-milestone achievements makes a number legible at a
   glance.
2. **No mid-term goal.** Stages change four times across the whole journey.
   Achievements give frequent, concrete targets in between.

Both are pure functions of the ledger that already exists, so nothing new has
to be tracked and the anti-farming rules (stable event IDs, caps, dedup) apply
automatically.

## 2. Titles

A title is a named rank derived **only** from total XP. No new state is stored;
a title is computed, exactly like a stage.

| Tier | Titles | XP range | Meaning |
|---|---|---|---|
| 1 | `Seedling` | 0 – 499 | just arrived |
| 2 | `Sprout` | 500 – 1,499 | first real activity |
| 3 | `Gardener` | 1,500 – 4,999 | a habit forming |
| 4 | `Botanist` | 5,000 – 11,999 | sustained work |
| 5 | `Arborist` | 12,000 – 24,999 | a serious garden |
| 6 | `Curator` | 25,000 – 49,999 | a collection, not a plant |
| 7 | `Archivist` | 50,000 – 99,999 | deep history |
| 8 | `Elderwood` | 100,000+ | the long haul |

- **Titles never go down.** XP only accumulates, so a title is monotonic. This
  matters: a reward that can be taken away by a bad week is a punishment, and
  PRODUCT.md explicitly rejects punishing engagement.
- **Thresholds are playtest values**, same caveat as XP rates. They are set so
  tier 3 lands where the current `mossling` stage starts (1,500) — the title
  ladder and the stage ladder should not tell contradictory stories.
- **Titles are separate from stages.** A stage is the *creature's* form; a title
  is the *user's* standing. Conflating them would mean an encounter-less user
  can never earn a title, which is wrong.

## 3. Achievements

Each achievement is a pure predicate over derived state (`ProductState`):
`events`, `companions`, `encounters`, `profile`. No new persistence — an
achievement is *unlocked* if its predicate is true right now.

### Categories

**Craft (from local Markdown events)**
| id | name | unlocks when |
|---|---|---|
| `first_note` | First Sprout | 1 `new-note` event |
| `notekeeper` | Notekeeper | 25 `new-note` events |
| `century_club` | Century Club | 100 `new-note` events |
| `word_count_10k` | Long-form | 10,000 total words from `new-words` events |
| `weaver` | Weaver | 50 `resolved-wikilink` events |
| `librarian` | Librarian | 500 `resolved-wikilink` events |

**Shipping (from GitHub verified events)**
| id | name | unlocks when |
|---|---|---|
| `first_merge` | First Merge | 1 `merged-pull-request` |
| `ship_it` | Ship It | 25 `merged-pull-request` |
| `release_engineer` | Release Engineer | 10 `published-release` |
| `green_build` | Green Build | 50 `successful-ci` |
| `closer` | Closer | 25 `closed-linked-issue` |

**Consistency**
| id | name | unlocks when |
|---|---|---|
| `first_day` | Day One | 1 `qualifying-active-day` |
| `week_streak` | Steady Week | 7 consecutive qualifying active days |
| `month_streak` | Unbroken | 30 consecutive qualifying active days |
| `session_ten` | Deep Work | 10 `work-session` events |

**Collection (from encounters / Essence)**
| id | name | unlocks when |
|---|---|---|
| `first_encounter` | First Encounter | 1 encounter draw |
| `duplicate` | Essence Found | 1 duplicate draw (Essence awarded) |
| `collector` | Collector | 5 companions in the collection |
| `family_complete` | Full Family | 4 distinct stages of one line owned/encountered |
| `mega_form` | Mastery | reach the `mastery` (Mega) slot on the active companion |

**Meta**
| id | name | unlocks when |
|---|---|---|
| `first_guest` | Welcome | a guest profile exists (everyone has this) |
| `night_owl` | Night Owl | any event between 00:00–04:00 local |
| `weekend` | Weekend Warrior | any event on a Saturday or Sunday |
| `both_sources` | Both Worlds | at least one `local` AND one `verified` event |

That is **24 achievements** across 6 categories. Every predicate reads state
Terrarium already derives; none requires new tracking or a network call.

### Rarity

Derived, not stored, from the achievement's own difficulty band — used only for
display order and color:

- `common` — one-shot or trivially reachable (`first_note`, `first_merge`, ...)
- `rare` — sustained (25+ events, 7-day streak)
- `epic` — deep commitment (100 notes, 30-day streak, 500 wikilinks)
- `legendary` — full mastery (`family_complete`, `mega_form`, `Elderwood`)

## 4. Surfaces

1. **`/progression`** (new page) — the title ladder with the user's current
   title marked, then achievements grouped by category, unlocked first, locked
   ones showing progress toward the threshold.
2. **`ProductActivityPanel`** — add the current title next to the existing XP
   readout (one line, no new layout).
3. **`/preview` and `/companions`** — show the title under the companion name.
4. **Public profile** (`/u/<handle>`) — title only, **not** the achievement
   list, unless the owner opted in to a public profile (the privacy gate from
   PR #42 already governs this page).

## 5. Explicitly NOT in scope

Copied from the Git City review, these are rejected on product grounds:

- **No raids / PvP.** Requires public data plus aggression; Terrarium is
  private-first. Rejected.
- **No loot boxes / gacha.** PRODUCT.md: "No paid random rolls."
- **No purchased items or billboards.** PRODUCT.md: "No paid Pokémon
  companions or paid random rolls." Cosmetic purchase with XP is a separate
  future feature (see below), not this one.
- **No achievements that reward raw commit count.** The ledger already caps and
  dedups; an achievement that counted raw pushes would reintroduce the farming
  the whole event model exists to prevent.
- **No competitive leaderboard changes.** Titles are personal standing, not a
  ranking.

## 6. Follow-up (not this spec)

- **XP sink:** spend XP on companion cosmetics. Needs its own spec; it changes
  XP from a pure readout into a spendable balance, which affects every XP
  surface.
- **Daily missions:** three rotating objectives per day with a claim step.
  Needs a scheduling decision (rotate by local day or UTC?) that the timezone
  gap in ROADMAP section 2 should settle first.

## 7. Tests (planned)

- Title thresholds: boundary values award the higher title; never decrease.
- Every achievement predicate: locked → unlocked at exactly the threshold.
- Achievement predicates are pure: same `ProductState` in, same set out.
- Empty state: a fresh guest profile unlocks exactly the "everyone" set
  (`first_guest`), nothing more.
- `night_owl` and `weekend` use the event's own timestamp, not "now".
- No achievement reads note content, paths, titles, or tags.

## 8. Acceptance

- `npm run typecheck`, `npm test`, `npm run build` all green.
- No new network calls; no new persistence; no schema change.
- The public profile exposes a title only for opted-in accounts.
