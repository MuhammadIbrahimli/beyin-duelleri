export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RATE_LIMITER?: RateLimit;
  SESSION_SECRET: string;
  ADMIN_TOKEN?: string;
  SITE_ORIGIN: string;
}
export interface AuthedVars { userId: string }
export type AppEnv = { Bindings: Env; Variables: AuthedVars };
