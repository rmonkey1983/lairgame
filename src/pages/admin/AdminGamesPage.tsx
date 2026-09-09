import { Link } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'

export default function AdminGamesPage() {
  return <PageShell eyebrow="Control Room" title="Seleziona una partita"><p className="max-w-md text-muted">Game selector esplicito. Dati reali arriveranno con Auth e Supabase.</p><Link className="action mt-8 w-fit" to="/admin/games/demo">Apri shell game demo</Link></PageShell>
}
