export interface AdminLoginRequest {
  readonly username: string;
  readonly password: string;
}

export interface AdminLoginResponse {
  readonly token: string;
  readonly expiresAt: string;
  readonly mustChangePassword: boolean;
}

export interface ChangePasswordRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface AdminProfile {
  readonly id: number;
  readonly username: string;
  readonly mustChangePassword: boolean;
}
