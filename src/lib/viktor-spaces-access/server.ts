import {
  PKCE_COOKIE_NAME,
  REVOCATION_ENDPOINT,
  SESSION_ENDPOINT,
  SESSION_MAX_AGE_SECONDS,
  SPACE_SESSION_COOKIE_NAME,
  SPACE_SESSION_DEV_COOKIE_NAME,
  TOKEN_ENDPOINT,
} from "./constants";
import type { ViktorAuthRoutesOptions, ViktorAuthStatus } from "./types";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  session_token: string;
  sid: string;
};

type PkceCookie = {
  state: string;
  verifier: string;
  targetPath?: string;
};

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const rawCookie = request.headers.get("cookie") ?? "";
  for (const part of rawCookie.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) continue;
    cookies.set(name, decodeURIComponent(valueParts.join("=")));
  }
  return cookies;
}

// Deploy-time Vercel rewrites inject space_origin as the canonical Space
// domain; anything else in that param is attacker-supplied and ignored.
const TRUSTED_SPACE_ORIGIN_SUFFIX = ".viktor.space";

function trustedSpaceOrigin(rawOrigin: string | null): string | null {
  if (!rawOrigin) return null;
  try {
    const parsed = new URL(rawOrigin);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(TRUSTED_SPACE_ORIGIN_SUFFIX)
    ) {
      return parsed.origin;
    }
  } catch {
    // Ignore malformed deployment-provided origins.
  }
  return null;
}

function requestOrigin(request: Request): string {
  const explicitSpaceOrigin = trustedSpaceOrigin(
    new URL(request.url).searchParams.get("space_origin"),
  );
  if (explicitSpaceOrigin) {
    return explicitSpaceOrigin;
  }
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

function cookieName(origin: string): string {
  return origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
    ? SPACE_SESSION_DEV_COOKIE_NAME
    : SPACE_SESSION_COOKIE_NAME;
}

function sessionCookie(params: {
  value: string;
  origin: string;
  maxAgeSeconds?: number;
}): string {
  const name = cookieName(params.origin);
  const attributes = [
    `${name}=${encodeURIComponent(params.value)}`,
    `Max-Age=${params.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (name === SPACE_SESSION_COOKIE_NAME) attributes.push("Secure");
  return attributes.join("; ");
}

function clearSessionCookie(origin: string): string {
  return sessionCookie({ value: "", origin, maxAgeSeconds: 0 });
}

function clearPkceCookie(): string {
  return `${PKCE_COOKIE_NAME}=; Max-Age=0; Path=/__viktor_auth; SameSite=Lax`;
}

function parsePkceCookie(rawCookie: string | undefined): PkceCookie | null {
  if (!rawCookie) return null;
  try {
    const parsed = JSON.parse(rawCookie) as Partial<PkceCookie>;
    if (
      typeof parsed.state === "string" &&
      typeof parsed.verifier === "string"
    ) {
      return {
        state: parsed.state,
        verifier: parsed.verifier,
        targetPath:
          typeof parsed.targetPath === "string" ? parsed.targetPath : undefined,
      };
    }
  } catch {
    const [state, verifier] = rawCookie.split(".");
    if (state && verifier) return { state, verifier };
  }
  return null;
}

function safeRedirectPath(path: string | undefined, fallback: string): string {
  const candidate = path || fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }
  return candidate;
}

function noStoreJson(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === requestOrigin(request);
}

export function createViktorAuthRoutes(options: ViktorAuthRoutesOptions) {
  const resource = `space:${options.resourceId}`;
  const successRedirectPath = options.successRedirectPath ?? "/";
  const deniedRedirectPath =
    options.deniedRedirectPath ?? "/__viktor_auth/denied";

  return {
    callback: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const origin = requestOrigin(request);
      if (error) {
        return Response.redirect(
          new URL(
            `${deniedRedirectPath}?reason=${encodeURIComponent(error)}`,
            origin,
          ),
          302,
        );
      }
      if (!code || !state) {
        return noStoreJson(
          { status: "denied", reason: "missing_callback_params" },
          { status: 400 },
        );
      }
      const pkceCookie = parsePkceCookie(
        parseCookies(request).get(PKCE_COOKIE_NAME),
      );
      if (pkceCookie?.state !== state || !pkceCookie.verifier) {
        return noStoreJson(
          { status: "denied", reason: "state_mismatch" },
          { status: 400, headers: { "set-cookie": clearPkceCookie() } },
        );
      }
      const tokenResponse = await fetch(
        new URL(TOKEN_ENDPOINT, options.viktorAuthBaseUrl),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            client_id: options.clientId,
            redirect_uri: `${origin}/__viktor_auth/callback`,
            resource,
            code_verifier: pkceCookie.verifier,
          }),
        },
      );
      if (!tokenResponse.ok) {
        return noStoreJson(
          { status: "denied", reason: "code_exchange_failed" },
          { status: 401, headers: { "set-cookie": clearPkceCookie() } },
        );
      }
      const tokenBody = (await tokenResponse.json()) as TokenResponse;
      const redirectPath = safeRedirectPath(
        pkceCookie.targetPath,
        successRedirectPath,
      );
      const response = new Response(null, {
        status: 302,
        headers: { location: new URL(redirectPath, origin).toString() },
      });
      response.headers.append("set-cookie", clearPkceCookie());
      response.headers.append(
        "set-cookie",
        sessionCookie({ value: tokenBody.session_token, origin }),
      );
      response.headers.set("cache-control", "no-store");
      return response;
    },
    me: async (request: Request): Promise<Response> => {
      const origin = requestOrigin(request);
      const sessionToken = parseCookies(request).get(cookieName(origin));
      if (!sessionToken) {
        return noStoreJson({
          status: "unauthenticated",
        } satisfies ViktorAuthStatus);
      }
      const statusResponse = await fetch(
        new URL(SESSION_ENDPOINT, options.viktorAuthBaseUrl),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session_token: sessionToken,
            client_id: options.clientId,
            resource,
          }),
        },
      );
      if (!statusResponse.ok) {
        return noStoreJson(
          { status: "denied", reason: "session_check_failed" },
          { status: 401 },
        );
      }
      const status = (await statusResponse.json()) as ViktorAuthStatus;
      return noStoreJson(status);
    },
    logout: async (request: Request): Promise<Response> => {
      const origin = requestOrigin(request);
      if (!sameOrigin(request)) {
        return noStoreJson(
          { status: "denied", reason: "origin_mismatch" },
          { status: 403 },
        );
      }
      const sessionToken = parseCookies(request).get(cookieName(origin));
      if (sessionToken) {
        await fetch(new URL(REVOCATION_ENDPOINT, options.viktorAuthBaseUrl), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_token: sessionToken }),
        });
      }
      return noStoreJson(
        { status: "unauthenticated" },
        { headers: { "set-cookie": clearSessionCookie(origin) } },
      );
    },
  };
}
