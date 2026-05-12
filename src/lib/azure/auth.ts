/**
 * Azure Entra ID (Microsoft Identity Platform) authentication.
 *
 * Implements:
 *   - Authorization Code flow (PKCE-friendly server-side companion).
 *   - JWKS-backed signature validation of access tokens via `jwks-rsa`.
 *   - Express middleware to gate API routes.
 */

import jwt, { type JwtPayload } from "jsonwebtoken";
import jwksClient, { type JwksClient } from "jwks-rsa";
import type { Request, Response, NextFunction } from "express";

import { ANONYMOUS_USER } from "./cosmos-repository";

export interface AzureEntraIdConfig {
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
  audience?: string;
}

export interface AuthenticatedUser {
  id: string; // Entra ID `oid` — partition key in Cosmos.
  email?: string;
  name?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

let config: AzureEntraIdConfig | null = null;
let jwks: JwksClient | null = null;

export function initializeEntraId(cfg: AzureEntraIdConfig): void {
  config = cfg;
  jwks = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${cfg.tenantId}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxEntries: 16,
    cacheMaxAge: 10 * 60 * 1000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 30,
  });
  console.log(`[Entra ID] Configured (tenant=${cfg.tenantId})`);
}

export function isEntraIdConfigured(): boolean {
  return config !== null;
}

function requireConfig(): AzureEntraIdConfig {
  if (!config) {
    throw new Error("Entra ID not initialized. Call initializeEntraId first.");
  }
  return config;
}

// ---------------------------------------------------------------------------
// Authorization Code flow
// ---------------------------------------------------------------------------

export function getAuthorizationUrl(
  redirectUri: string,
  scopes: string[] = ["openid", "profile", "email"],
  state?: string
): string {
  const cfg = requireConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    response_mode: "query",
  });
  if (state) params.set("state", state);
  return `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize?${params}`;
}

export interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const cfg = requireConfig();
  if (!cfg.clientSecret) {
    throw new Error("AZURE_CLIENT_SECRET is required for the authorization-code flow.");
  }

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: "openid profile email",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${data.error} — ${data.error_description}`);
  }
  return data as TokenResponse;
}

// ---------------------------------------------------------------------------
// JWKS-backed access-token verification
// ---------------------------------------------------------------------------

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!jwks) return reject(new Error("Entra ID JWKS client not initialized."));
    jwks.getSigningKey(kid, (err, key) => {
      if (err || !key) return reject(err || new Error("Signing key not found."));
      resolve(key.getPublicKey());
    });
  });
}

export interface EntraTokenClaims extends JwtPayload {
  oid?: string;
  preferred_username?: string;
  upn?: string;
  email?: string;
  name?: string;
  appid?: string;
  azp?: string;
  scp?: string;
  roles?: string[];
}

export async function verifyAccessToken(token: string): Promise<EntraTokenClaims> {
  const cfg = requireConfig();
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new Error("Malformed token.");
  }

  const kid = decoded.header.kid;
  if (!kid) throw new Error("Token header missing kid.");

  const publicKey = await getSigningKey(kid);
  const expectedAudience = cfg.audience || cfg.clientId;

  return new Promise<EntraTokenClaims>((resolve, reject) => {
    jwt.verify(
      token,
      publicKey,
      {
        algorithms: ["RS256"],
        audience: [expectedAudience, `api://${expectedAudience}`],
        issuer: [
          `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`,
          `https://sts.windows.net/${cfg.tenantId}/`,
        ],
      },
      (err, claims) => {
        if (err) return reject(err);
        resolve(claims as EntraTokenClaims);
      }
    );
  });
}

export function claimsToUser(claims: EntraTokenClaims): AuthenticatedUser {
  const id = claims.oid || claims.sub || ANONYMOUS_USER;
  return {
    id,
    email: claims.email || claims.preferred_username || claims.upn,
    name: claims.name,
  };
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * Attaches `req.user` when a valid bearer token is present.
 *
 * - With Entra ID configured: rejects invalid/expired tokens with 401.
 * - Without Entra ID configured (local dev): silently injects `ANONYMOUS_USER`
 *   so that the BIM compiler endpoints remain usable.
 */
export function requireAuth(opts: { optional?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isEntraIdConfigured()) {
      req.user = { id: ANONYMOUS_USER };
      return next();
    }

    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (!token) {
      if (opts.optional) {
        req.user = { id: ANONYMOUS_USER };
        return next();
      }
      return res.status(401).json({ error: "Authentication required." });
    }

    try {
      const claims = await verifyAccessToken(token);
      req.user = claimsToUser(claims);
      return next();
    } catch (err: any) {
      if (opts.optional) {
        req.user = { id: ANONYMOUS_USER };
        return next();
      }
      return res
        .status(401)
        .json({ error: "Invalid token.", details: err?.message?.slice(0, 200) });
    }
  };
}
