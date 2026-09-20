export type Role = 'CLIENT' | 'TRAINER';

export interface User {
  id: number;
  username: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface FirstAccessRequest {
  newPassword: string;
  // Facoltativi: di norma l'istruttore li ha gia' inseriti.
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  fields?: Record<string, string>;
  user?: User;
  data?: T;
}
