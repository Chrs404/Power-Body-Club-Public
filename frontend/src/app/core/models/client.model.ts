export interface SubscriptionInfo {
  id?: number;
  startDate: string;
  endDate: string;
  plan: string | null;
  notes?: string | null;
  daysLeft: number | null;
  expired: boolean;
}

export interface Client {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  notes: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  subscription: SubscriptionInfo | null;
}

export interface ClientDetail extends Client {
  subscriptions: SubscriptionInfo[];
}

export interface ClientListResponse {
  success: boolean;
  items: Client[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GeneratedCredentials {
  username: string;
  temporaryPassword: string;
}

export interface CreateClientRequest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  notes?: string;
  subscriptionStart?: string;
  subscriptionEnd?: string;
  subscriptionPlan?: string;
}

export interface UpdateClientRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  notes?: string;
  isActive?: boolean;
}

export interface CreateSubscriptionRequest {
  startDate: string;
  endDate: string;
  plan?: string;
  notes?: string;
}

export interface ClientsSummary {
  total: number;
  active: number;
  expiring: number;
  expired: number;
}

export interface ClientFilters {
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  expiring?: number;
  page?: number;
  pageSize?: number;
}
