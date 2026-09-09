import { useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'

export default function PlayerShellPage() {
  const { gameCode } = useParams()
  return <PageShell eyebrow="Player session" title="In attesa della Regia"><p className="max-w-md text-muted">Partita <strong className="text-text">{gameCode}</strong>. Questa è una shell foundation: nessun gameplay attivo.</p></PageShell>
}
