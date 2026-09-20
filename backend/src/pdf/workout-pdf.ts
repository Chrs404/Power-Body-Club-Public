import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';

import { MUSCLE_GROUP_LABELS } from '../utils/muscle-groups';
import { dividiInBlocchi } from '../utils/superset';

/*
 * Generazione del PDF di una scheda.
 *
 * Il formato riprende il protocollo cartaceo gia' in uso in palestra:
 * intestazione con logo e dati, poi una tabella per ogni giorno con
 * esercizio, serie/ripetizioni e una colonna vuota "Pesi utilizzati e
 * note" da compilare a mano durante l'allenamento.
 *
 * Quella colonna vuota non e' una dimenticanza: e' il motivo per cui il
 * foglio viene stampato. Chi si allena segna li' i carichi, poi
 * eventualmente li riporta nell'app.
 */

// Palette del logo
const CARBONE = '#2C2C24';
const OLIVA = '#5E6544';
const OCRA = '#C0894F';
const GRIGIO = '#6B6559';
const GRIGIO_CHIARO = '#EDE9E0';
const CREMA = '#F7F2E8';

const MARGINE = 45;
const LARGHEZZA_PAGINA = 595.28; // A4
const LARGHEZZA_UTILE = LARGHEZZA_PAGINA - MARGINE * 2;

// Colonne della tabella: esercizio, serie e ripetizioni, note da compilare
const COL_ESERCIZIO = LARGHEZZA_UTILE * 0.42;
const COL_SERIE = LARGHEZZA_UTILE * 0.2;
const COL_NOTE = LARGHEZZA_UTILE - COL_ESERCIZIO - COL_SERIE;

export interface EsercizioPdf {
  order: number;
  sets: number;
  reps: string;
  restSeconds: number;
  suggestedWeight: unknown;
  notes: string | null;
  linkedToPrevious: boolean;
  exercise: { id: number; name: string; muscleGroup: string };
}

export interface GiornoPdf {
  label: string;
  exercises: EsercizioPdf[];
}

export interface SchedaPdf {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
  days: GiornoPdf[];
  cliente: { firstName: string | null; lastName: string | null; username: string };
  /**
   * Vero per una scheda rapida (modello), che non appartiene a nessun
   * cliente e non ha un periodo di validità: l'intestazione mostra
   * allora i soli dati che hanno senso, invece di campi vuoti.
   */
  modello?: boolean;
}

function dataItaliana(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function settimaneFra(inizio: Date | null, fine: Date | null): string {
  if (!inizio || !fine) return '—';
  const giorni = Math.round((fine.getTime() - inizio.getTime()) / 86_400_000);
  const settimane = Math.round(giorni / 7);
  if (settimane <= 0) return `${giorni} giorni`;
  return settimane === 1 ? '1 SETTIMANA' : `${settimane} SETTIMANE`;
}

function peso(valore: unknown): string {
  if (valore === null || valore === undefined || valore === '') return '';
  const n = Number(valore);
  if (Number.isNaN(n) || n === 0) return '';
  return `${parseFloat(n.toFixed(2))} kg`;
}

/** Gruppi muscolari presenti in un giorno, per l'intestazione della tabella. */
function gruppiDelGiorno(giorno: GiornoPdf): string {
  const visti: string[] = [];
  for (const ex of giorno.exercises) {
    const etichetta =
      MUSCLE_GROUP_LABELS[ex.exercise.muscleGroup] ?? ex.exercise.muscleGroup;
    if (!visti.includes(etichetta)) {
      visti.push(etichetta);
    }
  }
  return visti.join(' - ').toUpperCase();
}

export function generaPdfScheda(scheda: SchedaPdf): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGINE,
    bufferPages: true,
    info: {
      Title: `${scheda.name} - ${scheda.cliente.lastName ?? ''} ${scheda.cliente.firstName ?? ''}`.trim(),
      Author: 'A.S.D. Power Body Club',
      Subject: 'Protocollo di allenamento',
    },
  });

  intestazione(doc, scheda);

  for (const giorno of scheda.days) {
    tabellaGiorno(doc, giorno);
  }

  if (scheda.notes) {
    noteFinali(doc, scheda.notes);
  }

  piediPagina(doc);
  return doc;
}

// ---------------------------------------------------------------- sezioni

function intestazione(doc: PDFKit.PDFDocument, scheda: SchedaPdf): void {
  const logo = path.resolve(__dirname, '../../assets/logo.png');

  if (fs.existsSync(logo)) {
    const lato = 95;
    doc.image(logo, (LARGHEZZA_PAGINA - lato) / 2, MARGINE, {
      width: lato,
      height: lato,
    });
    doc.y = MARGINE + lato + 14;
  }

  doc
    .fillColor(OLIVA)
    .fontSize(17)
    .font('Helvetica-Bold')
    .text('PROTOCOLLO DI ALLENAMENTO', MARGINE, doc.y, {
      width: LARGHEZZA_UTILE,
      align: 'center',
    });

  doc.moveDown(0.3);
  doc
    .strokeColor(OCRA)
    .lineWidth(1.5)
    .moveTo(MARGINE + LARGHEZZA_UTILE / 3, doc.y)
    .lineTo(MARGINE + (LARGHEZZA_UTILE / 3) * 2, doc.y)
    .stroke();

  doc.moveDown(1.2);

  if (scheda.modello) {
    // Un modello non appartiene a nessuno e non ha un periodo: mostrarli
    // vuoti darebbe l'impressione di dati mancanti invece che non pertinenti.
    campo(doc, 'Scheda rapida', scheda.name);
    campo(doc, 'Giorni di allenamento', String(scheda.days.length));
  } else {
    const nome =
      [scheda.cliente.firstName, scheda.cliente.lastName].filter(Boolean).join(' ') ||
      scheda.cliente.username;

    campo(doc, 'Nome e cognome', nome);
    campo(doc, 'Protocollo', scheda.name);
    campo(doc, 'Validità', settimaneFra(scheda.startDate, scheda.endDate));
    campo(doc, 'Giorni di allenamento', String(scheda.days.length));
    campo(
      doc,
      'Periodo',
      `${dataItaliana(scheda.startDate)} — ${dataItaliana(scheda.endDate)}`
    );
  }

  doc.moveDown(1);
}

function campo(doc: PDFKit.PDFDocument, etichetta: string, valore: string): void {
  const y = doc.y;
  const larghezzaEtichetta = 140;

  doc
    .fillColor(CARBONE)
    .fontSize(9.5)
    .font('Helvetica-Bold')
    .text(`${etichetta}:`, MARGINE, y, { width: larghezzaEtichetta });

  // Il valore sta in un riquadro, come nel modulo cartaceo
  const xRiquadro = MARGINE + larghezzaEtichetta;
  const larghezzaRiquadro = LARGHEZZA_UTILE - larghezzaEtichetta;

  doc
    .rect(xRiquadro, y - 3, larghezzaRiquadro, 17)
    .fillAndStroke(CREMA, GRIGIO_CHIARO);

  doc
    .fillColor(CARBONE)
    .fontSize(9.5)
    .font('Helvetica')
    .text(valore, xRiquadro + 8, y, {
      width: larghezzaRiquadro - 16,
      align: 'center',
    });

  doc.y = y + 21;
}

function tabellaGiorno(doc: PDFKit.PDFDocument, giorno: GiornoPdf): void {
  const blocchi = dividiInBlocchi(
    giorno.exercises.map((ex, i) => ({ ...ex, id: i }))
  );

  /*
   * Si va a pagina nuova solo se non entra nemmeno l'intestazione con le
   * prime due righe: spezzare una tabella lunga e' meglio che lasciare
   * mezzo foglio bianco. Il controllo per riga, piu' sotto, evita
   * comunque che una riga finisca a cavallo di due pagine.
   */
  const altezzaMinima = 40 + 24 * Math.min(2, giorno.exercises.length);
  if (doc.y + altezzaMinima > doc.page.height - 60) {
    doc.addPage();
  }

  doc.moveDown(0.6);

  // Titolo del giorno con i gruppi muscolari, come nel protocollo cartaceo
  const yTitolo = doc.y;
  doc.rect(MARGINE, yTitolo, LARGHEZZA_UTILE, 22).fill(OLIVA);
  doc
    .fillColor('#FFFFFF')
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(
      `${giorno.label.toUpperCase()}${
        gruppiDelGiorno(giorno) ? '  ·  ' + gruppiDelGiorno(giorno) : ''
      }`,
      MARGINE + 10,
      yTitolo + 6.5,
      { width: LARGHEZZA_UTILE - 20 }
    );

  doc.y = yTitolo + 22;

  // Intestazione delle colonne
  const yCol = doc.y;
  doc.rect(MARGINE, yCol, LARGHEZZA_UTILE, 18).fillAndStroke(CREMA, GRIGIO_CHIARO);
  doc.fillColor(GRIGIO).fontSize(7.5).font('Helvetica-Bold');
  doc.text('ESERCIZIO', MARGINE + 8, yCol + 5.5, { width: COL_ESERCIZIO - 10 });
  doc.text('SERIE E REPS', MARGINE + COL_ESERCIZIO + 8, yCol + 5.5, {
    width: COL_SERIE - 10,
  });
  doc.text(
    'PESI UTILIZZATI E NOTE',
    MARGINE + COL_ESERCIZIO + COL_SERIE + 8,
    yCol + 5.5,
    { width: COL_NOTE - 10 }
  );

  doc.y = yCol + 18;

  let contatoreSuperset = 0;

  for (const blocco of blocchi) {
    const superset = blocco.length > 1;
    const sigla = superset ? String.fromCharCode(65 + contatoreSuperset++) : null;

    for (const [posizione, ex] of blocco.entries()) {
      const etichetta = superset ? `${sigla}${posizione + 1}  ` : '';
      const testoSerie = `${ex.sets}x${ex.reps}`;

      /*
       * Altezza calcolata sul contenuto, non fissa.
       *
       * Le ripetizioni sono un campo libero che può contenere la
       * notazione del tempo di esecuzione ("12 positiva 2 secondi,
       * fermo 1, negativa 4"): un testo del genere va a capo su più
       * righe nella sua colonna, e con un'altezza fissa sarebbe finito
       * sopra la riga successiva.
       */
      doc.font('Helvetica-Bold').fontSize(9);
      const hSerie = doc.heightOfString(testoSerie, { width: COL_SERIE - 10 });

      doc.font('Helvetica').fontSize(9);
      const hNome = doc.heightOfString(etichetta + ex.exercise.name, {
        width: COL_ESERCIZIO - 14,
      });

      // 10 punti di respiro sopra e sotto; 24 resta il minimo, così le
      // righe brevi mantengono l'aspetto compatto di prima.
      const altezza = Math.max(24, hSerie + 14, hNome + 14);

      if (doc.y + altezza + 2 > doc.page.height - 55) {
        doc.addPage();
      }

      const yRiga = doc.y;

      // Le righe di un superset hanno un fondo appena velato e una barra
      // laterale: si distinguono senza bisogno di una legenda.
      if (superset) {
        doc.rect(MARGINE, yRiga, LARGHEZZA_UTILE, altezza).fill('#FBF6EE');
        doc.rect(MARGINE, yRiga, 3, altezza).fill(OCRA);
      }

      doc
        .strokeColor(GRIGIO_CHIARO)
        .lineWidth(0.5)
        .moveTo(MARGINE, yRiga + altezza)
        .lineTo(MARGINE + LARGHEZZA_UTILE, yRiga + altezza)
        .stroke();

      // Nome dell'esercizio, con la sigla del superset
      doc.fillColor(CARBONE).fontSize(9).font('Helvetica');
      doc.text(etichetta + ex.exercise.name, MARGINE + 10, yRiga + 7.5, {
        width: COL_ESERCIZIO - 14,
      });

      /*
       * Serie x ripetizioni sulla prima riga, recupero e peso consigliato
       * sotto in piccolo. Prima il recupero occupava una riga propria per
       * ogni esercizio: ripetitivo e uno spreco di spazio su un foglio
       * che deve stare in poche pagine.
       */
      const carico = peso(ex.suggestedWeight);
      doc.fillColor(CARBONE).font('Helvetica-Bold').fontSize(9);
      doc.text(testoSerie, MARGINE + COL_ESERCIZIO + 8, yRiga + 5, {
        width: COL_SERIE - 10,
      });

      const dettagli: string[] = [];
      // Nei superset il recupero e' del blocco, non del singolo esercizio:
      // indicarlo su ogni riga sarebbe fuorviante.
      if (!superset && ex.restSeconds > 0) {
        dettagli.push(`rec. ${formattaRecupero(ex.restSeconds)}`);
      }
      if (carico) {
        dettagli.push(carico);
      }
      if (dettagli.length > 0) {
        doc.fillColor(GRIGIO).font('Helvetica').fontSize(7);
        // Sotto il testo delle serie, che ora può occupare più righe
        doc.text(dettagli.join('  ·  '), MARGINE + COL_ESERCIZIO + 8, yRiga + 5 + hSerie + 1, {
          width: COL_SERIE - 10,
        });
      }

      // Note dell'istruttore, se presenti; altrimenti lo spazio resta
      // libero per essere compilato a mano
      if (ex.notes) {
        doc.fillColor(GRIGIO).fontSize(7.5).font('Helvetica-Oblique');
        doc.text(ex.notes, MARGINE + COL_ESERCIZIO + COL_SERIE + 8, yRiga + 8, {
          width: COL_NOTE - 12,
          ellipsis: true,
        });
      }

      doc.y = yRiga + altezza;
    }

    // Solo per i superset: il recupero vale per l'intero giro
    if (superset && blocco[0].restSeconds > 0) {
      const yRec = doc.y;
      doc.rect(MARGINE, yRec, LARGHEZZA_UTILE, 13).fill('#FBF6EE');
      doc.rect(MARGINE, yRec, 3, 13).fill(OCRA);
      doc.fillColor(OCRA).fontSize(7).font('Helvetica-Bold');
      doc.text(
        `SUPERSET ${sigla} — senza recupero fra gli esercizi, ` +
          `${formattaRecupero(blocco[0].restSeconds)} a fine giro`,
        MARGINE + 12,
        yRec + 3.5,
        { width: LARGHEZZA_UTILE - 20 }
      );
      doc.y = yRec + 13;
    }
  }

  doc.moveDown(0.4);
}

function formattaRecupero(secondi: number): string {
  if (secondi < 60) return `${secondi}"`;
  const minuti = Math.floor(secondi / 60);
  const resto = secondi % 60;
  return resto === 0 ? `${minuti}'` : `${minuti}'${resto}"`;
}

function noteFinali(doc: PDFKit.PDFDocument, note: string): void {
  if (doc.y + 60 > doc.page.height - 60) {
    doc.addPage();
  }

  doc.moveDown(0.8);
  const y = doc.y;

  doc.fillColor(CARBONE).fontSize(9).font('Helvetica-Bold');
  doc.text('NOTE', MARGINE, y);
  doc.moveDown(0.3);

  doc.fillColor(GRIGIO).fontSize(9).font('Helvetica');
  doc.text(note, MARGINE, doc.y, { width: LARGHEZZA_UTILE });
}

function piediPagina(doc: PDFKit.PDFDocument): void {
  const intervallo = doc.bufferedPageRange();
  const totale = intervallo.count;

  for (let i = intervallo.start; i < intervallo.start + totale; i++) {
    doc.switchToPage(i);

    const y = doc.page.height - 42;

    doc
      .strokeColor(GRIGIO_CHIARO)
      .lineWidth(0.5)
      .moveTo(MARGINE, y)
      .lineTo(MARGINE + LARGHEZZA_UTILE, y)
      .stroke();

    /*
     * L'opzione height e' obbligatoria qui, non decorativa.
     *
     * Con una width ma senza height, pdfkit calcola l'altezza del blocco
     * come "tutto lo spazio rimanente" e, scrivendo a fondo pagina,
     * conclude che il testo non ci sta: crea allora una pagina nuova.
     * Il solo disegno dei piedi raddoppiava cosi' il numero di pagine.
     *
     * Dichiarando un'altezza esplicita, il calcolo torna e nessuna
     * pagina viene aggiunta.
     */
    const altezzaTesto = 12;

    doc.fillColor(GRIGIO).fontSize(7.5).font('Helvetica');
    doc.text('A.S.D. Power Body Club — Caccamo (PA)', MARGINE, y + 7, {
      width: LARGHEZZA_UTILE / 2,
      height: altezzaTesto,
      lineBreak: false,
    });
    doc.text(
      `Pagina ${i - intervallo.start + 1} di ${totale}`,
      MARGINE + LARGHEZZA_UTILE / 2,
      y + 7,
      {
        width: LARGHEZZA_UTILE / 2,
        height: altezzaTesto,
        align: 'right',
        lineBreak: false,
      }
    );
  }
}
