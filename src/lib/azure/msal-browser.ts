/**
 * MSAL.js bootstrap for the SPA.
 *
 * Wires up a singleton PublicClientApplication that talks to the same Entra ID
 * tenant the backend validates against. The companion API route is
 * `POST /api/auth/token` — the frontend forwards the acquired access token
 * there only when a verified identity is required for a server action.
 *
 * Env (Vite-exposed, must be prefixed with VITE_):
 *   VITE_AZURE_TENANT_ID
 *   VITE_AZURE_CLIENT_ID
 *   VITE_AZURE_REDIRECT_URI   (defaults to window.location.origin)
 *   VITE_AZURE_API_SCOPE      (e.g. api://<client-id>/access_as_user — optional)
 */

import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
  InteractionRequiredAuthError,
  type PopupRequest,
} from "@azure/msal-browser";

let pca: PublicClientApplication | null = null;
let initPromise: Promise<PublicClientApplication> | null = null;

export interface MsalEnv {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  apiScope?: string;
}

function readEnv(): MsalEnv | null {
  const tenantId = import.meta.env.VITE_AZURE_TENANT_ID as string | undefined;
  const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined;
  if (!tenantId || !clientId) return null;
  return {
    tenantId,
    clientId,
    redirectUri:
      (import.meta.env.VITE_AZURE_REDIRECT_URI as string | undefined) ||
      window.location.origin,
    apiScope: import.meta.env.VITE_AZURE_API_SCOPE as string | undefined,
  };
}

export function isMsalConfigured(): boolean {
  return readEnv() !== null;
}

export async function getMsal(): Promise<PublicClientApplication> {
  if (pca) return pca;
  if (initPromise) return initPromise;

  const env = readEnv();
  if (!env) {
    throw new Error(
      "MSAL is not configured. Set VITE_AZURE_TENANT_ID and VITE_AZURE_CLIENT_ID in .env.local."
    );
  }

  const config: Configuration = {
    auth: {
      clientId: env.clientId,
      authority: `https://login.microsoftonline.com/${env.tenantId}`,
      redirectUri: env.redirectUri,
      postLogoutRedirectUri: env.redirectUri,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    },
  };

  initPromise = (async () => {
    const instance = new PublicClientApplication(config);
    await instance.initialize();
    pca = instance;
    return instance;
  })();

  return initPromise;
}

function defaultScopes(env: MsalEnv): string[] {
  return env.apiScope
    ? [env.apiScope, "openid", "profile", "email"]
    : ["openid", "profile", "email", "User.Read"];
}

export async function loginPopup(): Promise<AuthenticationResult> {
  const env = readEnv();
  if (!env) throw new Error("MSAL not configured.");
  const instance = await getMsal();
  const request: PopupRequest = { scopes: defaultScopes(env), prompt: "select_account" };
  const result = await instance.loginPopup(request);
  if (result.account) instance.setActiveAccount(result.account);
  return result;
}

export async function logout(): Promise<void> {
  const instance = await getMsal();
  const active = instance.getActiveAccount();
  await instance.logoutPopup({ account: active || undefined });
}

export async function getActiveAccount(): Promise<AccountInfo | null> {
  const env = readEnv();
  if (!env) return null;
  const instance = await getMsal();
  const active = instance.getActiveAccount();
  if (active) return active;
  const all = instance.getAllAccounts();
  if (all.length > 0) {
    instance.setActiveAccount(all[0]);
    return all[0];
  }
  return null;
}

/**
 * Silently acquires an access token (falling back to popup if interaction is
 * required). Returns null when MSAL is not configured — callers must accept
 * unauthenticated flow in that case.
 */
export async function acquireAccessToken(): Promise<string | null> {
  const env = readEnv();
  if (!env) return null;
  const instance = await getMsal();
  const account = (await getActiveAccount()) || undefined;
  if (!account) return null;

  const scopes = defaultScopes(env);
  try {
    const result = await instance.acquireTokenSilent({ account, scopes });
    return result.accessToken || null;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const result = await instance.acquireTokenPopup({ scopes, account });
      return result.accessToken || null;
    }
    throw err;
  }
}

/**
 * Convenience wrapper around `fetch` that injects a Bearer token when MSAL is
 * configured and the user is signed in. Falls back to anonymous requests
 * otherwise (the backend accepts both via `requireAuth({ optional: true })`).
 */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await acquireAccessToken().catch(() => null);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
