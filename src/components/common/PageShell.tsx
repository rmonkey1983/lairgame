import type { ReactNode } from 'react'

type PageShellProps = { eyebrow: string; title: string; children: ReactNode }

export function PageShell({ eyebrow, title, children }: PageShellProps) {
  return <main className="app-shell mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 py-4 sm:px-8 sm:py-6 lg:px-10">
    <header className="shell-header border-b border-border pb-5">
      <div className="brand-lockup">
        <img className="brand-mark" src="/paw-logo.png" alt="PAW" />
        <div>
          <p className="brand-wordmark">PAW <span>/</span> Liar System</p>
          <p className="brand-subtitle">A Cena Con Il Bugiardo</p>
        </div>
      </div>
      <div className="shell-heading">
        <p className="shell-kicker text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        <h1 className="shell-title mt-3 text-3xl font-semibold tracking-tight text-text">{title}</h1>
      </div>
    </header>
    <section className="shell-content flex flex-1 flex-col justify-center py-10">{children}</section>
  </main>
}
