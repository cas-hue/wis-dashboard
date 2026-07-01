import { PKCE_COOKIE_NAME } from "./constants";
import type { PkcePair } from "./types";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createState(): string {
  return crypto.randomUUID();
}

export async function createPkcePair(): Promise<PkcePair> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64UrlEncode(random);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return {
    verifier,
    challenge: base64UrlEncode(new Uint8Array(digest)),
  };
}

function pkceCookieAttributes(value: string, maxAgeSeconds: number): string {
  const attributes = [
    `${PKCE_COOKIE_NAME}=${value}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/__viktor_auth",
    "SameSite=Lax",
  ];
  if (window.location.protocol === "https:") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

export function writePkceCookie(params: {
  state: string;
  verifier: string;
  targetPath?: string;
  maxAgeSeconds?: number;
}): void {
  const value = encodeURIComponent(
    JSON.stringify({
      state: params.state,
      verifier: params.verifier,
      targetPath: params.targetPath ?? "/",
    }),
  );
  document.cookie = pkceCookieAttributes(value, params.maxAgeSeconds ?? 600);
}

export function clearPkceCookie(): void {
  document.cookie = pkceCookieAttributes("", 0);
}
