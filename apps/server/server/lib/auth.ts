import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const { hash, compare } = bcrypt;

// SESSION_SECRET is required for security - fail fast if not set
if (!process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET environment variable is required. Generate one with: openssl rand -base64 32"
  );
}

const SECRET_KEY = new TextEncoder().encode(process.env.SESSION_SECRET);

const ALGORITHM = "HS256";
const TOKEN_EXPIRY = "7d";
const AUTO_LOGIN_EXPIRY = "30d"; // Auto-login tokens expire after 30 days

export interface JWTPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

// Password hashing with bcrypt
export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return compare(password, hashedPassword);
}

// JWT token management
export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, username: payload.username })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(SECRET_KEY);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// Create an auto-login token with 30-day expiration
export async function createAutoLoginToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, username: payload.username, autoLogin: true })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(AUTO_LOGIN_EXPIRY)
    .sign(SECRET_KEY);
}

// API Key generation - cryptographically secure
export function generateApiKey(): string {
  const prefix = "dk_";
  const bytes = randomBytes(24);
  const key = bytes.toString("base64url");
  return prefix + key;
}

// API Key hashing - store hashed version in DB
export async function hashApiKey(apiKey: string): Promise<string> {
  // Use a lower cost factor for API keys since they're already random
  return hash(apiKey, 10);
}

export async function verifyApiKey(
  apiKey: string,
  hashedApiKey: string
): Promise<boolean> {
  return compare(apiKey, hashedApiKey);
}

// Rate limiting helper
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || now > existing.resetTime) {
    // Start new window
    const resetTime = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: config.maxRequests - 1, resetTime };
  }

  if (existing.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetTime: existing.resetTime };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - existing.count,
    resetTime: existing.resetTime,
  };
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

// Security constants
export const RATE_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 attempts per 15 min
  register: { windowMs: 60 * 60 * 1000, maxRequests: 10 }, // 10 registrations per hour
  api: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 req/min for API
  usage: { windowMs: 60 * 1000, maxRequests: 60 }, // 60 req/min for usage push
} as const;

// Generate CSRF token
export function generateCSRFToken(): string {
  return randomBytes(32).toString("base64url");
}

// Validate origin for CSRF protection
export function validateOrigin(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.some(allowed => {
    if (allowed === "*") return true;
    return origin === allowed || origin.endsWith(allowed.replace("*", ""));
  });
}
