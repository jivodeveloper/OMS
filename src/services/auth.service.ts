import { api } from './api';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserState {
  id: number;
  name: string;
  code: string;
}

export interface User {
  id: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  role_display?: string | null;
  company: { id: number; name: string } | null;
  main_group: { id: number; name: string } | null;
  state: (UserState & { code?: string }) | null;
  states?: UserState[];
  category?: { id?: number; category?: string; name?: string } | null;
  sub_group?: string | null;
  is_active: boolean;
  // Account flags / timestamps shown on the Profile screen (read-only).
  is_superuser?: boolean;
  is_staff?: boolean;
  last_login?: string | null;
  date_joined?: string | null;
  created_at: string;
  // Admin-granted page keys giving access beyond the user's role (see ASSIGNABLE_PAGES).
  extra_pages?: string[];
  // Additional roles held alongside the primary `role` (e.g. payment_approver).
  extra_roles?: { id: number; name: string; display_name: string }[];
  // Every role name the user holds — primary + extras. Prefer this over `role`
  // when deciding access, or a user granted a function role looks like they
  // hold none.
  roles?: string[];
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    user: User;
    tokens: {
      access: string;
      refresh: string;
    };
  };
  errors?: object;
}

export const authService = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    return api.post('/auth/login/', credentials);
  },
  
  getProfile: async (token: string): Promise<{ success: boolean; data: User }> => {
    return api.get('/auth/profile/', token);
  },
};
