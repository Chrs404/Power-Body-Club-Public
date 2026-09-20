/**
 * Raggruppamento degli esercizi in blocchi (superset).
 *
 * Un blocco e' una sequenza contigua di esercizi in cui il primo ha
 * linkedToPrevious = false e i successivi true. Un esercizio singolo
 * e' semplicemente un blocco di un solo elemento.
 *
 * Queste funzioni sono pure e non dipendono da Prisma: la stessa logica
 * serve al backend per i completamenti e al frontend per la resa grafica.
 */

export interface RigaCollegabile {
  id: number;
  linkedToPrevious: boolean;
}

/**
 * Divide una lista ordinata di esercizi nei blocchi che la compongono.
 * La prima riga viene sempre trattata come capogruppo, anche se marcata
 * come collegata: un dato incoerente non deve produrre un blocco vuoto.
 */
export function dividiInBlocchi<T extends RigaCollegabile>(righe: T[]): T[][] {
  const blocchi: T[][] = [];

  for (const [indice, riga] of righe.entries()) {
    if (indice === 0 || !riga.linkedToPrevious) {
      blocchi.push([riga]);
    } else {
      blocchi[blocchi.length - 1].push(riga);
    }
  }

  return blocchi;
}

/**
 * Restituisce tutti gli esercizi del blocco a cui appartiene quello indicato.
 * Serve per il completamento: spuntando un superset si spuntano insieme
 * tutti i suoi esercizi.
 */
export function bloccoDi<T extends RigaCollegabile>(
  righe: T[],
  exerciseId: number
): T[] {
  for (const blocco of dividiInBlocchi(righe)) {
    if (blocco.some((r) => r.id === exerciseId)) {
      return blocco;
    }
  }
  return [];
}

/**
 * Corregge i collegamenti dopo un riordino o una rimozione:
 * la prima riga di un giorno non puo' essere collegata a nulla.
 */
export function normalizzaCollegamenti<T extends { linkedToPrevious?: boolean }>(
  righe: T[]
): T[] {
  return righe.map((riga, indice) => ({
    ...riga,
    linkedToPrevious: indice === 0 ? false : riga.linkedToPrevious === true,
  }));
}
