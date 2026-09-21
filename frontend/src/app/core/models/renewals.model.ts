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
}

export interface RenewalsResponse {
  items: RenewalItem[];
  summary: RenewalsSummary;
}
