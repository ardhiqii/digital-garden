import type { Metadata } from 'next'
import { FlowDemo } from '@/components/game/FlowDemo'

export const metadata: Metadata = {
  title: 'Flow demo',
  description:
    'Walk the first-run flow without a GitHub account: starter companion, a',
}

/**
 * A guest-only walkthrough of the first-run loop. See FlowDemo for why this
 * exists as a separate surface rather than a set of instructions.
 */
export default function FlowDemoPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <header className="mb-8">
        <p
          className="font-data text-xs uppercase tracking-widest"
          style={{ color: 'var(--ink-muted)', letterSpacing: '0.15em' }}
        >
          Prototype walkthrough
        </p>
        <h1 className="font-ui mt-2 text-3xl font-semibold tracking-tighter">
          First run, end to end
        </h1>
        <p className="font-prose mt-3 text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          Drives the real engine functions with simulated events, so the flow can
          be inspected without OAuth credentials or a repository. Nothing here
          touches the network or your saved profile.
        </p>
      </header>
      <FlowDemo />
    </main>
  )
}
