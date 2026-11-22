export type RenewalType = 'subscription' | 'workout';

export interface RenewalItem {
  clientId: number;
  clientName: string;
  clientUsername: string;
  type: RenewalType;
  /** Nome del piano o della scheda. */
  label: string;
  /** null quando il cliente non ha un abbonamento o una scheda. */
  endDate: string | null;
  /** Negativo se già scaduto, 0 se scade oggi, null se non c'è scadenza. */
  daysLeft: number | null;
}

export interface RenewalsCategorySummary {
  expired: number;
  expiring: number;
}

export interface RenewalsSummary {
  subscriptions: RenewalsCategorySummary;
  workouts: RenewalsCategorySummary;
  /** Clienti in elenco per l'eliminazione automatica. */
  deletions?: number;
}

/**
 * Cliente con abbonamento e scheda entrambi scaduti: verra' eliminato
 * automaticamente il giorno deleteOn, salvo "Rimanda".
 */
export interface DeletionItem {
  clientId: number;
  clientName: string;
  clientUsername: string;
  subscriptionEnd: string | null;
  workoutEnd: string | null;
  deleteOn: string;
  /** Giorni che mancano; 0 o meno = alla prossima pulizia. */
  daysLeft: number;
}

export interface RenewalsResponse {
  items: RenewalItem[];
  summary: RenewalsSummary;
  /** Assente nelle risposte dei server precedenti alla 2.0. */
  deletions?: DeletionItem[];
}
