# Reference: Git City — feature comparison

> Notes from reviewing <https://www.thegitcity.com> as a reference for
> Terrarium's social/collection surfaces. This is **research, not a plan**: it
> records what the reference does so future decisions do not have to re-scrape
> the site. What Terrarium takes (and refuses) is decided in the specs that
> reference this file, currently
> [`SPEC-progression-titles-achievements.md`](SPEC-progression-titles-achievements.md).

Reviewed: 2026-09-27.

## The reference

Git City renders a GitHub profile as a 3D pixel-art building in one global
city. At review time its public dataset held **87,594 developers** and
**177,069,625 contributions**, regenerated continuously (a single gzipped JSON
document, `city-v2.json`, served from Supabase storage and read by the client).

Its model is **public by default**: every GitHub account with activity appears
as a building, whether or not the person knows. That is the single most
important difference from Terrarium, which is private-first and gates public
profiles behind an explicit opt-in.

## Mechanics worth knowing

### Building size is a normalized global comparison
`norms` in the dataset carries `maxContrib`, `maxStars`, `maxComposite`,
`maxXp`, `maxVisits`. Every building's height is that account's value scaled
against the global maximum, so "who is tallest" is visible at a glance. Terrarium
should **not** copy this: it makes a global ranking the default state of the UI.

### 25 levels, 6 tiers
- Curve: `25 × level^2.2`; max level 25 costs 29,744 XP total.
- Tiers with a colour on the building border: Localhost (1–4), Staging (5–8),
  Production (9–13), Open Source (14–18), Unicorn (19–23), Founder (24+).
- Level names are dev jokes: Hello World, Console.log, First Commit, Bug
  Hunter, Pull Request, Code Review, Merge Conflict, CI/CD, Deployed, On-Call,
  Hotfix, Tech Lead, Architect, Maintainer, Contributor, Core Team, RFC Author,
  Star Project, Distinguished, Principal, Fellow, 10x Engineer, Unicorn,
  Founder, Legend.
- **Daily XP cap 150** for "casual engagement" (check-ins, dailies, kudos,
  visits, the flying mini-game). Raids, achievements, GitHub imports and
  referrals are explicitly uncapped.

Terrarium adapts the *idea* of a named ladder and a cap, at a much smaller
scale (see the titles spec). It does not adopt the level names, the curve, or
the global normalization.

### ~30 achievements
Observed ids include: `first_push`, `committed`, `builder`, `grinder`,
`pioneer_10k`, `machine`, `architect`, `rising_star`, `legend`, `god_mode`,
`famous`, `popular`, `factory`, `white_rabbit`, `on_fire`, `heist_master`,
`kingpin`, `pickpocket`, `burglar`, `endorser`, `endorsed_10`, `recruiter`,
`dedicated`, `generous_streak`, `gifted`, `event_veteran`, `daily_rookie`,
`daily_regular`, `appreciated`, `portfolio_complete`.

Distribution is a long tail: 65,167 accounts have `first_push`, 1,037 have
`legend`, 2 have `kingpin`. A working achievement system needs that shape —
a cheap first rung everyone reaches and a top rung almost nobody does.

Terrarium adopts the mechanic (predicates over derived state) with its own
list; see the titles/achievements spec.

### Daily missions + streaks
Three missions per day (`/api/dailies`, `/api/dailies/progress`,
`/api/dailies/claim`), a dailies streak with escalating reward, and a
`streak_freeze` item to protect it. Missions are claimed, not automatic.

### Cosmetic economy
26 items. Most are bought with earned XP; a few are `$1.00`. Categories:
rooftop (antenna array, helipad, rooftop garden, rooftop fire, satellite dish,
spire, spotlight, pool party), visual (neon trim, neon outline, lightning aura,
particle aura, hologram ring, LED banner, billboard, custom colour), raid tags,
raid boosts, companion duck, GitHub star, crown. The shop previews an item live
before purchase.

Terrarium rejects the purchase path (see the not-in-scope list in its spec) but
the *XP sink* idea is worth a future spec.

### Raids (PvP)
Attack another developer's building: takeoff, flight, shoot, impact, shield-hit,
each with its own audio file. Loadouts (Mech Keyboard, PC Tower, Hacker Rig),
boosts (War Paint, Battle Armor, EMP Device), and a tag left on the victim with
an expiry. Endpoints: `/api/raid/preview`, `/api/raid/execute`,
`/api/raid/loadout`, `/api/pvp/credit-kill`, `/api/events/credit-damage`.

**Rejected by Terrarium.** Aggression between users plus public exposure of
everyone's progress is the opposite of the product's stance.

### Social signals
Kudos (with weekly give/receive limits), visit counts, endorsements,
referrals, online presence (`/api/online`, `/api/presence`). Terrarium can use
derived-only versions of the last two later; kudos and endorsements need a
moderation story first.

### Other endpoints observed
`/api/checkin`, `/api/broadcast`, `/api/drops/pull`, `/api/drops/my-pulls`,
`/api/pixels/balance`, `/api/pixels/spend`, `/api/fly-scores`,
`/api/events/active`, `/api/vscode-key`, `/api/sky-ads`, `/api/claim`,
`/api/claim-free-item`, `/api/city/my-lot`, `/api/items`,
`/api/preferences/theme`, `/api/achievements/mark-seen`.

Notable extras: a flying mini-game with its own leaderboard, a hidden "White
Rabbit" achievement, a second currency ("pixels"), limited-time events, a
VS Code extension key endpoint, and a claim flow (50,886 of 87,594 accounts
had claimed, i.e. ~58% — an acquisition funnel, not a feature).

## Take / don't take

**Take** (as specs, not as copy-paste):
- Named titles derived from total XP.
- Achievements as predicates over the event ledger.
- Daily missions with an explicit claim step, and a streak.
- The XP-sink idea (spend XP on cosmetics) — future spec.
- A shareable profile card (Terrarium already has `/api/creature.svg`; a
  social card is a smaller step from there).

**Don't take:**
- Public-by-default exposure, or global normalized comparison.
- Raids / PvP.
- Loot boxes, purchased items, billboards, ads.
- Achievements that reward raw commit counts.
- A second currency.
