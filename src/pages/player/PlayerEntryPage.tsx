import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { ensureAnonymousPlayerSession, joinGame, validateJoinInput } from '../../domain/player/player.join'

export default function PlayerEntryPage() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [seatNumber, setSeatNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateJoinInput(gameCode, nickname, tableNumber, seatNumber)
    if (validationError) { setError(validationError); return }
    setError(null)
    setSubmitting(true)
    const session = await ensureAnonymousPlayerSession()
    if (!session.ok) { setError(session.error.userMessage); setSubmitting(false); return }
    const joined = await joinGame({ gameCode: gameCode!.trim(), nickname: nickname.trim(), tableNumber: Number(tableNumber), seatNumber: Number(seatNumber) })
    if (!joined.ok) { setError(joined.error.userMessage); setSubmitting(false); return }
    navigate(`/play/${gameCode!.trim()}/session`)
  }

  return <PageShell eyebrow="Player entry" title="Entra nella partita">
    <div className="max-w-md">
      <p className="text-sm uppercase tracking-[0.16em] text-muted">Game code</p>
      <p className="mt-2 font-mono text-3xl font-semibold text-primary">{gameCode}</p>
      <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="nickname">Nickname
          <input id="nickname" autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="table-number">Numero tavolo
          <input id="table-number" inputMode="numeric" type="number" min="1" value={tableNumber} onChange={(event) => setTableNumber(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="seat-number">Numero posto
          <input id="seat-number" inputMode="numeric" type="number" min="1" value={seatNumber} onChange={(event) => setSeatNumber(event.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="action w-fit" type="submit" disabled={submitting}>{submitting ? 'Ingresso in corso…' : 'Entra nel gioco'}</button>
      </form>
    </div>
  </PageShell>
}
