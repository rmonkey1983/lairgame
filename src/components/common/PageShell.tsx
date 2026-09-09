import type { ReactNode } from 'react'

type PageShellProps = { eyebrow: string; title: string; children: ReactNode }

export function PageShell({ eyebrow, title, children }: PageShellProps) {
  return <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-5 py-8 sm:px-8">
    <header className="border-b border-border pb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">{title}</h1>
    </header>
    <section className="flex flex-1 flex-col justify-center py-10">{children}</section>
  </main>
}
