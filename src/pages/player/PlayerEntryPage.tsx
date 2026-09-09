import { Link, useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'

export default function PlayerEntryPage() {
  const { gameCode } = useParams()
  return <PageShell eyebrow="Player entry" title="Entra nella partita">
    <div className="max-w-md">
      <p className="text-sm uppercase tracking-[0.16em] text-muted">Game code</p>
      <p className="mt-2 font-mono text-3xl font-semibold text-primary">{gameCode}</p>
      <p className="mt-6 text-muted">Join controllato sarà disponibile in una milestone successiva.</p>
      <Link className="action mt-8 w-fit" to={`/play/${gameCode}/session`}>Apri shell waiting</Link>
    </div>
  </PageShell>
}
