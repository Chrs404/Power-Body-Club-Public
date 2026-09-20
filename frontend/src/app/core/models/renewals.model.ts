export type RenewalType = 'subscription' | 'workout';

export interface RenewalItem {
  clientId: number;
  clientName: string;
  clientUsername: string;
  type: RenewalType;
  /** Nome del piano o della scheda. */
  label: string;
  endDate: string;
  /** Negativo se già scaduto, 0 se scade oggi. */
  daysLeft: number;
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
