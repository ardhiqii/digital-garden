'use client'

/**
 * The one sign-in control, for every surface that needs it.
 *
 * WHY THIS EXISTS: signing in was offered in the Navbar and on `/github`, but two
 * surfaces told the user to sign in without giving them anything to click.
 * `/write` said "Sign in or export a backup" with no button, and the signed-out
 * leaderboard described what signing in would unlock and then left the user to
 * find the Navbar themselves. A user who reads an instruction and cannot act on it
 * concludes the page is broken. `/github` also carried its own copy of the same
 * anchor, which is how the two drifted apart in the first place.
 *
 * WHY NOT NEXT/LINK: the flow leaves the app for github.com through a server
 * redirect, so a client-side navigation would break it. This is a plain anchor,
 * same as the Navbar's.
 *
 * WHY THE CURRENT PATH RIDES ALONG: `loginHrefFor` sends the browser back where it
 * started once authorization completes, so a reader on `/write` returns to
 * `/write` rather than being dropped on the home page with their note open no
 * longer in front of them. The value is validated as a same-origin path at every
 * hop; see `oauth-return-path.ts`.
 */

import { usePathname } from 'next/navigation'
import { loginHrefFor } from '@/lib/sync/oauth-return-path'

export interface SignInButtonProps {
  /** Button copy. Defaults to the Navbar's wording. */
  label?: string
  /**
   * `solid` for the primary action in an empty state, `quiet` for a notice
   * where signing in is offered rather than asked for.
   */
  variant?: 'solid' | 'quiet'
  /**
   * Where to return after authorizing. Server components cannot read the
   * current path, so they pass it explicitly; client components leave it unset
   * and it is read from the router.
   */
  path?: string
  /**
   * Extra classes only. A variant styles the button's own look; this lets a
   * caller opt into a page's local row treatment without losing the variants.
   */
  className?: string
  /** Inline style overrides, for callers that match a surrounding row. */
  style?: React.CSSProperties
}

export default function SignInButton({
  label = 'Sign in with GitHub',
  variant = 'solid',
  path,
  className = '',
  style: styleOverride,
}: SignInButtonProps) {
  const pathname = usePathname()
  const returnTo = path ?? pathname

  const style =
    variant === 'solid'
      ? { background: 'var(--accent)', color: 'var(--paper)' }
      : { border: '1px solid var(--rule)', color: 'var(--ink)' }

  return (
    <a
      href={loginHrefFor(returnTo)}
      className={`font-ui inline-block text-sm px-4 py-2 transition-opacity hover:opacity-80 ${className}`}
      style={{ ...style, ...styleOverride }}
    >
      {label}
    </a>
  )
}
