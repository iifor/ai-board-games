export interface AdminIdentity {
  readonly id: number;
  readonly username: string;
  readonly mustChangePassword: boolean;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    admin: AdminIdentity;
  };
}
