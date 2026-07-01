import type { ViktorSpaceAccessAllow, ViktorSpaceAccessMode } from "./types";

const VALID_ACCESS_MODES = new Set(["public", "space_auth", "viktor_auth"]);

type ViktorSpacesEnv = Pick<
  ImportMetaEnv,
  | "VITE_VIKTOR_AUTH_CLIENT_ID"
  | "VITE_VIKTOR_SPACES_ACCESS_MODE"
  | "VITE_VIKTOR_SPACES_API_URL"
  | "VITE_VIKTOR_SPACES_SPACE_ID"
>;

function getDefaultViktorSpacesEnv(): ViktorSpacesEnv {
  const viteEnv = import.meta.env as ViktorSpacesEnv | undefined;
  if (viteEnv) {
    return viteEnv;
  }
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return (runtime.process?.env ?? {}) as ViktorSpacesEnv;
}

function requireEnvValue(
  env: ViktorSpacesEnv,
  name: keyof ViktorSpacesEnv,
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required Viktor Spaces env var: ${name}`);
  }
  return value;
}

export function getViktorSpaceAccessMode(
  env: ViktorSpacesEnv = getDefaultViktorSpacesEnv(),
): ViktorSpaceAccessMode {
  const configured = requireEnvValue(env, "VITE_VIKTOR_SPACES_ACCESS_MODE");
  if (!VALID_ACCESS_MODES.has(configured)) {
    throw new Error(`Invalid VITE_VIKTOR_SPACES_ACCESS_MODE: ${configured}`);
  }
  return configured as ViktorSpaceAccessMode;
}

export function getViktorSpaceAccessAllow(
  env: ViktorSpacesEnv = getDefaultViktorSpacesEnv(),
): ViktorSpaceAccessAllow[] {
  return getViktorSpaceAccessMode(env) === "viktor_auth"
    ? ["workspace_members"]
    : ["public"];
}

export function getViktorSpacesAuthEnabled(
  env: ViktorSpacesEnv = getDefaultViktorSpacesEnv(),
): boolean {
  return getViktorSpaceAccessMode(env) === "space_auth";
}

export function shouldRequireViktorSpaceAccess(
  env: ViktorSpacesEnv = getDefaultViktorSpacesEnv(),
): boolean {
  return getViktorSpaceAccessAllow(env).includes("workspace_members");
}

export function getViktorSpacesSpaceId(
  env: ViktorSpacesEnv = getDefaultViktorSpacesEnv(),
): string {
  return env.VITE_VIKTOR_SPACES_SPACE_ID || "";
}

export function getViktorAuthBaseUrl(
  env: ViktorSpacesEnv = getDefaultViktorSpacesEnv(),
): string {
  return env.VITE_VIKTOR_SPACES_API_URL || "";
}

export function getViktorAuthClientId(
  env: ViktorSpacesEnv = getDefaultViktorSpacesEnv(),
): string {
  const configured = env.VITE_VIKTOR_AUTH_CLIENT_ID;
  if (configured) return configured;
  const spaceId = getViktorSpacesSpaceId(env);
  return spaceId ? `space-${spaceId}` : "";
}
