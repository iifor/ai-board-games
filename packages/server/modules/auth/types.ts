export interface AdminUser {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  enabled: number;
  must_change_password: number;
  created_at: string;
  updated_at: string;
}

export interface AuthTokenPayload {
  sub: number;
  username: string;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  mustChangePassword: boolean;
  user: {
    id: number;
    username: string;
    displayName: string;
  };
}
