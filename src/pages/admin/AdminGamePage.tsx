import { useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'

export default function AdminGamePage() {
  const { gameCode } = useParams()
  return <PageShell eyebrow="Control Room · game context" title="Game shell"><p className="text-muted">Partita selezionata:</p><p className="mt-2 font-mono text-3xl font-semibold text-primary">{gameCode}</p><p className="mt-6 max-w-md text-muted">Controlli lifecycle, roster e phase saranno aggiunti in seguito.</p></PageShell>
}
