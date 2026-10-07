# Design: starter companion, daily draw, and repo assignment

Status: **proposal, awaiting review.** No code written yet.
Decisions taken by Wipiii: `1a · 2a · 3a · 4 = fastest to test`.

## The problem, stated honestly

Three things are wrong, and they compound.

**1. Connecting GitHub looks like it did nothing.** The baseline path records
`no old history awarded` and hands back zero XP and zero companions, because
existing history must not be replayable. That is correct, but the user is left
staring at a `1 companion` collection with nothing to do next.

**2. Two different things are both called "collection".** `/companions` renders
"Garden collection": one creature generated per GitHub repo, currently 20 tiles
for 24 repos. The real companion collection is a single Pikachu. The page title
and the shared word make the user read 20 tiles as "I already have 20
companions". They were built earlier because the collection looked empty; now
they mislead.

**3. There is no mission layer at all.** `grep -i 'mission|quest|dailylogin'`
returns nothing. The only way to gain a companion is a hidden meter that fills
from 100 events, so the path to the second companion is invisible and slow.

## What is being built

### A. `/companions` shows the user's companions only (decision 1a)

Remove the repo-creature grid from `/companions`. The page becomes: the user's
own collection (starter + draw results), each with its stage and XP.

The repo creatures are not deleted as a capability, they stop being presented
as the collection. `/api/creature` and `/api/creature.svg` stay; they are what
paints a companion onto a repo README. That is the same feature decision 3a
turns into a user choice.

### B. Daily login draw (decisions 2a and 4)

A draw per calendar day, on first visit after local midnight.

- New module `apps/web/src/lib/game/daily-draw.ts`: pure, no clock of its own.
  `isDailyDrawDue(lastClaimedDay, today)` and `claimDailyDraw(...)`.
- Persisted inside the existing encounter state rather than a new store: add
  `lastDailyDrawDay: string | null` to `EncounterState`. The draw itself already
  has a persistence mechanism (`draws`, `essenceByFamily`); a second store would
  be a second source of truth.
- Feed it through the **existing** `advanceEncounter` trigger, with
  `progress: threshold` so a claim always completes a draw. No parallel draw
  path, no duplicated weighting logic.
- Trigger id `daily:<YYYY-MM-DD>` keeps `processedTriggerIds` doing the dedupe:
  one claim per day per guest, and a replayed claim is a no-op rather than a
  double draw.
- The day boundary comes from the same trusted local clock already used for the
  content caps. A user who moves their system clock forward gains one draw per
  day, which is the same exposure the caps already accept for a local-only
  source (PRODUCT.md 10a).

**Decision 4 = keep the 100-event meter as well.** Fastest path: the daily draw
is an ADDITIONAL trigger, not a replacement. The meter stays exactly as it is,
so nothing about the existing progression regresses and there is one less thing
to re-tune before this can be tested. Re-tuning the threshold is a separate
decision once the daily path has been felt in practice.

### C. Assign companions to repos (decision 3a)

One companion per repo, chosen by the user, bounded by what they own.

- Needs a new mapping: `assignments: { repositoryId: string; companionId: string }[]`
  in the guest profile.
- The bound is the whole point: `assignments.length <= distinct companion ids
  owned`. A user with 3 companions can dress 3 repos. This is what makes the
  collection mean something.
- `/api/creature` takes an explicit companion id when one is assigned, and falls
  back to the current generated species when it is not, so existing README
  embeds keep working.
- Companion reference ids are unique per acquisition (`draw.id`), but an
  assignment must point at a family id, because that is what the sprite lookup
  uses. Two Pikachu-family draws are two entries in the collection and one
  choice of sprite.

## What this deliberately does not do

- No streak (2b). It is a game-design layer that needs its own balance pass.
- No replacement of the 100-event meter (4b/4c).
- No new persistence store for the daily draw.

## Order of work

1. **PR #54 first.** The OAuth callback still lands the browser on
   `https://0.0.0.0:3101` (ERR_ADDRESS_INVALID) after a SUCCESSFUL sign-in.
   Login has to work before any progression feature is worth testing. Merge and
   deploy.
2. **C** then **B** then **A**: assignment is what the user asked for in the
   most concrete terms; the daily draw is what makes companions obtainable; the
   `/companions` cleanup is presentation and can land last without blocking
   anything.

## Open questions for Wipiii

- A companion assigned to a repo: does the same companion follow onto several
  repos, or is each companion spent on exactly one repo? "Spent" is the stricter
  reading and makes the bound bite harder.
- On the user's own repo, does the assigned companion replace the generated
  creature in the README, or sit beside it?
