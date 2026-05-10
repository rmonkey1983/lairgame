import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, AlertCircle, ScanLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import BackgroundEffects from '@/components/game/BackgroundEffects';
import PowerButton from '@/components/game/PowerButton';

const DEFAULT_TABLE_CODE = 'BBL-QR-7';

const parseTicketPayload = (raw) => {
  const value = (raw || '').trim();
  if (!value) return { ticketId: '' };

  if (value.startsWith('{') && value.endsWith('}')) {
    try {
      const parsed = JSON.parse(value);
      return {
        ticketId: parsed.ticket_id || parsed.ticketId || '',
        name: parsed.name || '',
        tableCode: parsed.table_code || parsed.tableCode || DEFAULT_TABLE_CODE,
      };
    } catch {
      return { ticketId: value };
    }
  }

  if (value.includes('ticket_id=')) {
    try {
      const url = new URL(value);
      const ticketId = url.searchParams.get('ticket_id') || '';
      const name = url.searchParams.get('name') || '';
      const tableCode = url.searchParams.get('table_code') || DEFAULT_TABLE_CODE;
      return { ticketId, name, tableCode };
    } catch {
      return { ticketId: value };
    }
  }

  return { ticketId: value };
};

const getBarcodeDetector = () => {
  if (typeof window === 'undefined' || typeof window.BarcodeDetector === 'undefined') {
    return null;
  }

  return new window.BarcodeDetector({ formats: ['qr_code'] });
};

const registerPlayerProfile = async ({ ticketId, name, tableCode }) => {
  const safeTableCode = tableCode || DEFAULT_TABLE_CODE;
  const safeName = (name || '').trim() || `Giocatore ${ticketId.slice(-4).toUpperCase()}`;

  const { data: existingSession, error: sessionError } = await supabase
    .from('game_sessions')
    .select('players, logs')
    .eq('table_code', safeTableCode)
    .maybeSingle();

  if (sessionError) throw sessionError;

  const currentPlayers = existingSession?.players || [];
  const alreadyInSession = currentPlayers.some(
    (p) => p?.ticket_id === ticketId || p?.name?.toLowerCase() === safeName.toLowerCase()
  );

  if (alreadyInSession) return;

  const newPlayer = {
    id: Date.now(),
    name: safeName,
    role: 'innocente',
    ticket_id: ticketId,
    tableCode: safeTableCode,
  };

  const updatedPlayers = [...currentPlayers, newPlayer];
  const updatedLogs = [
    { time: new Date().toLocaleTimeString(), msg: `${safeName} confermato da scanner reception` },
    ...(existingSession?.logs || []),
  ].slice(0, 15);

  if (!existingSession) {
    const { error: createSessionError } = await supabase
      .from('game_sessions')
      .insert([
        {
          table_code: safeTableCode,
          phase: 'waiting',
          players: updatedPlayers,
          active_story: "Eri a cena con un vecchio amico che non vedevi da anni.",
          timer_duration: 60,
          votes: {},
          logs: updatedLogs,
        },
      ]);

    if (createSessionError) throw createSessionError;
    return;
  }

  const { error: updateSessionError } = await supabase
    .from('game_sessions')
    .update({
      players: updatedPlayers,
      logs: updatedLogs,
    })
    .eq('table_code', safeTableCode);

  if (updateSessionError) throw updateSessionError;
};

export default function ReceptionScanner() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const detectorRef = useRef(null);

  const [manualInput, setManualInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState({ type: 'idle', message: 'Scanner pronto.' });

  const supportsCameraScanner = useMemo(() => !!getBarcodeDetector(), []);

  const stopScanner = useCallback(() => {
    setIsScanning(false);
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const confirmTicketToReception = useCallback(async (rawPayload) => {
    const parsed = parseTicketPayload(rawPayload);
    const ticketId = parsed.ticketId?.trim();

    if (!ticketId) {
      setStatus({ type: 'error', message: 'QR non valido: ticket_id mancante.' });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: 'loading', message: `Conferma ticket ${ticketId} in corso...` });

    try {
      const { data: existing, error: selectError } = await supabase
        .from('participants')
        .select('*')
        .eq('ticket_id', ticketId)
        .maybeSingle();

      if (selectError) throw selectError;

      if (!existing) {
        setStatus({
          type: 'error',
          message: `Ticket ${ticketId} non trovato nel database prenotazioni. Verifica che sia stato acquistato dal sito.`,
        });
        return;
      }

      const updatePayload = { status: 'validated' };
      if (!existing.name && parsed.name) updatePayload.name = parsed.name;
      if (!existing.table_code && parsed.tableCode) updatePayload.table_code = parsed.tableCode;

      const { error: updateError } = await supabase
        .from('participants')
        .update(updatePayload)
        .eq('ticket_id', ticketId);

      if (updateError) throw updateError;

      const resolvedName = existing.name || parsed.name || '';
      const resolvedTableCode = existing.table_code || parsed.tableCode || DEFAULT_TABLE_CODE;
      await registerPlayerProfile({ ticketId, name: resolvedName, tableCode: resolvedTableCode });

      setStatus({ type: 'success', message: `Ticket ${ticketId} validato e profilo giocatore creato automaticamente.` });
      setManualInput('');
    } catch (err) {
      const rawMessage = err.message || 'Errore conferma ticket.';
      const userMessage = rawMessage.includes('row-level security')
        ? 'Permesso negato da Supabase (RLS). Il ticket deve esistere e la policy deve consentire update su participants.'
        : rawMessage;
      setStatus({ type: 'error', message: userMessage });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!supportsCameraScanner) {
      setStatus({ type: 'error', message: 'Scanner camera non supportato su questo browser.' });
      return;
    }

    try {
      detectorRef.current = detectorRef.current || getBarcodeDetector();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus({ type: 'idle', message: 'Inquadra il QR del biglietto.' });
      setIsScanning(true);
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Impossibile avviare la fotocamera.' });
      stopScanner();
    }
  }, [stopScanner, supportsCameraScanner]);

  useEffect(() => {
    if (!isScanning) return undefined;

    const intervalId = setInterval(async () => {
      if (!videoRef.current || !detectorRef.current || isProcessing) return;

      try {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        const qr = barcodes?.[0]?.rawValue;
        if (qr) {
          stopScanner();
          confirmTicketToReception(qr);
        }
      } catch {
        // keep scanning loop alive
      }
    }, 400);

    return () => clearInterval(intervalId);
  }, [confirmTicketToReception, isProcessing, isScanning, stopScanner]);

  useEffect(() => () => stopScanner(), [stopScanner]);

  return (
    <div className="relative min-h-screen bg-[#000000] text-white p-6 md:p-10 font-display overflow-hidden">
      <BackgroundEffects />
      <main className="relative z-10 max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter">
            Reception <span className="text-[#ff003c]">Scanner</span>
          </h1>
          <p className="text-white/40 uppercase tracking-[0.35em] text-[0.6rem] font-bold mt-3">
            Validazione ticket QR su Supabase condiviso
          </p>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 space-y-5">
          <div className="aspect-video rounded-2xl border border-white/10 bg-black/60 flex items-center justify-center overflow-hidden relative">
            <video ref={videoRef} className={`w-full h-full object-cover ${isScanning ? 'opacity-100' : 'opacity-0'}`} playsInline muted />
            {!isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 gap-3">
                <ScanLine size={34} />
                <p className="text-[0.7rem] uppercase tracking-[0.25em]">Scanner fermo</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <PowerButton
              ariaLabel="Avvia scanner fotocamera"
              onClick={startScanner}
              disabled={isScanning || !supportsCameraScanner}
              className="!py-3 !text-[0.65rem]"
            >
              <Camera size={14} /> Avvia Scanner
            </PowerButton>
            <button
              aria-label="Ferma scanner fotocamera"
              onClick={stopScanner}
              className="px-5 py-3 rounded-2xl border border-white/15 bg-white/5 text-[0.65rem] uppercase font-black tracking-widest text-white/70 hover:text-white transition-all"
            >
              <span className="inline-flex items-center gap-2"><CameraOff size={14} /> Stop</span>
            </button>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 space-y-4">
          <h2 className="text-lg font-black uppercase italic tracking-tight">Fallback Manuale</h2>
          <p className="text-[0.65rem] text-white/50 uppercase tracking-[0.2em]">
            Incolla il ticket, URL o payload JSON del QR
          </p>
          <textarea
            aria-label="Input manuale ticket"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            className="w-full h-24 rounded-2xl bg-black/40 border border-white/10 p-4 text-sm focus:outline-none focus:border-[#ff003c]/50"
            placeholder='Esempio: TKT-123 oppure {"ticket_id":"TKT-123","name":"Mario"}'
          />
          <PowerButton
            ariaLabel="Conferma ticket manualmente"
            onClick={() => confirmTicketToReception(manualInput)}
            disabled={isProcessing || !manualInput.trim()}
            className="!py-3 !text-[0.65rem]"
          >
            <CheckCircle2 size={14} /> Conferma Ticket
          </PowerButton>
        </section>

        <section
          className={`rounded-2xl border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : status.type === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-white/10 bg-white/5 text-white/70'
          }`}
        >
          <div className="inline-flex items-center gap-2">
            {status.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{status.message}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
