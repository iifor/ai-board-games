interface AdminBootstrapConfig {
  username: string;
  password: string;
}

interface AuthConfig {
  jwtSecret: string;
  admin: AdminBootstrapConfig | null;
}

function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env.NODE_ENV === 'production';
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  const username = String(env.ADMIN_USERNAME || '').trim();
  const password = String(env.ADMIN_PASSWORD || '');

  if (production && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  }
  if (production && !username) {
    throw new Error('ADMIN_USERNAME is required in production.');
  }
  if (production && password.trim().length < 12) {
    throw new Error('ADMIN_PASSWORD must contain at least 12 characters in production.');
  }
  if (!production && Boolean(username) !== Boolean(password)) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be configured together.');
  }

  return {
    jwtSecret: jwtSecret || 'development-only-jwt-secret',
    admin: username && password ? { username, password } : null,
  };
}

export { readAuthConfig };
export type { AdminBootstrapConfig, AuthConfig };
