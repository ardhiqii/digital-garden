/**
 * The sign-in entry point is offered wherever the UI asks the user to sign in.
 *
 * WHY THIS IS A TEST AND NOT A CONVENTION: the failure mode here is silence. A
 * page that says "Sign in" and provides no control still renders, still
 * typechecks, and still passes every other suite, because the copy and the
 * control are separate nodes. The only way a missing button is ever noticed is
 * by a user who cannot proceed. Pinning the pairing per surface is the whole
 * point.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// This file lives at src/components/layout, so the web root is three levels up.
const WEB = path.join(__dirname, '..', '..', '..')

function read(relative: string): string {
  return readFileSync(path.join(WEB, relative), 'utf8')
}

/** Surfaces that tell the user to sign in must also hand them a control. */
const SURFACES_REQUIRING_A_CONTROL: { file: string; why: string }[] = [
  {
    file: 'src/components/game/GuestCompanionOnboarding.tsx',
    why: 'the guest-mode notice on /write instructs the user to sign in',
  },
  {
    file: 'src/app/leaderboard/page.tsx',
    why: 'the signed-out leaderboard describes what signing in unlocks',
  },
  {
    file: 'src/components/game/GitHubSourcePanel.tsx',
    why: 'the not-connected branch of /github offers the GitHub flow',
  },
]

describe('sign-in is one control, reused', () => {
  it('renders the shared control on every surface that asks for a sign-in', () => {
    const missing = SURFACES_REQUIRING_A_CONTROL.filter(
      ({ file }) => !read(file).includes('SignInButton'),
    ).map(({ file, why }) => `${file} (${why})`)

    expect(missing).toEqual([])
  })

  it('does not reintroduce a second copy of the sign-in markup', () => {
    // A raw anchor to the login endpoint outside the shared control is how the
    // surfaces drifted apart in the first place.
    const offenders = SURFACES_REQUIRING_A_CONTROL.filter(({ file }) =>
      read(file).includes('/api/auth/login'),
    ).map(({ file }) => file)

    expect(offenders).toEqual([])
  })

  it('builds the href through the validated return-path helper', () => {
    // The control must never concatenate its own query string: the return path
    // round-trips through a cookie and is an open redirect if unvalidated.
    const source = read('src/components/layout/SignInButton.tsx')

    expect(source).toContain('loginHrefFor')
    expect(source).not.toMatch(/\/api\/auth\/login['"`]/)
  })

  it('returns the user to where they started', () => {
    // The whole reason the button is shared: authorizing from /write must land
    // back on /write. Server components pass the path explicitly; client
    // components read it from the router.
    const source = read('src/components/layout/SignInButton.tsx')

    expect(source).toContain('usePathname')
    expect(source).toContain('path ?? pathname')
  })
})
