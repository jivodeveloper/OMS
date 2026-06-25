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
  company: { id: number; name: string } | null;
  main_group: { id: number; name: string } | null;
  state: UserState | null;
  states?: UserState[];
  is_active: boolean;
  created_at: string;
  // Admin-granted page keys giving access beyond the user's role (see ASSIGNABLE_PAGES).
  extra_pages?: string[];
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
