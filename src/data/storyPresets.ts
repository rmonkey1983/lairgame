export const storyPresets = [
  {
    id: 'codice-rosso',
    name: 'Codice Rosso: Il Tradimento',
    missions: {
      truth: "Siete il consiglio di amministrazione della TechNova. Stanotte alle 02:00 AM qualcuno ha rubato il codice sorgente della vostra nuova App. Il ladro è a questo tavolo. Interrogatevi a vicenda sui vostri alibi di stanotte.",
      lie: "Hai rubato tu il codice. Il tuo alibi: dalle 01:00 alle 03:00 eri al locale 'Luna Nera' a bere un drink. Se ti accusano di aver usato il tuo badge per entrare, inventa che lo hai smarrito due giorni fa."
    },
    events: [
      {
        minute: 20,
        target: 'single', // Giocatore Singolo
        title: 'INTERCETTAZIONE DELLA POLIZIA',
        options: "RIVELO L'INDIZIO, LO TENGO SEGRETO",
        payload: "La polizia ha verificato il 'Luna Nera'. Ieri sera ha chiuso all'01:30 per un guasto elettrico. Chi dice di essere stato lì alle 02:00 mente. Condividi l'informazione."
      },
      {
        minute: 35,
        target: 'roles', // Solo ruoli specifici (Complice)
        targetRole: 'accomplice',
        title: 'AIUTA IL TUO PARTNER',
        options: 'INTERVENGO, RESTO IN SILENZIO',
        payload: "L'alibi del Bugiardo sta crollando. Inserisciti e inventa che il proprietario del 'Luna Nera' è un vecchio amico e vi ha fatto restare a bere a serrande chiuse."
      },
      {
        minute: 50,
        target: 'single',
        title: 'REGISTRAZIONE TELECAMERE',
        options: 'ACCUSO PUBBLICAMENTE, INDAGO IN SILENZIO',
        payload: "I tecnici hanno un video. Il ladro indossava [OGGETTO/COLORE DEL BUGIARDO]. Guardati intorno. Chi lo indossa?"
      },
      {
        minute: 75,
        target: 'all',
        title: 'ALLERTA SICUREZZA',
        options: 'MI FIDO DEI MIEI SOSPETTI, NON MI FIDO DI NESSUNO',
        payload: "L'Hacker ha clonato il sistema. Un indizio al tavolo è falso. Scegliete con attenzione di chi fidarvi in vista del voto."
      }
    ]
  }
];
