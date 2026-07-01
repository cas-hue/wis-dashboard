import {
  AUTHORIZATION_ENDPOINT,
  DEFAULT_SCOPE,
  PKCE_METHOD,
} from "./constants";
import { createPkcePair, createState, writePkceCookie } from "./pkce";
import { markViktorAuthReturnPending } from "./sessionMarkers";
import type { AuthorizeUrlConfig, ViktorAuthConfig } from "./types";

export function buildAuthorizeUrl(config: AuthorizeUrlConfig): string {
  const url = new URL(AUTHORIZATION_ENDPOINT, config.viktorAuthBaseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", config.state);
  url.searchParams.set("code_challenge", config.codeChallenge);
  url.searchParams.set("code_challenge_method", PKCE_METHOD);
  url.searchParams.set("resource", `space:${config.resourceId}`);
  url.searchParams.set("scope", config.scope ?? DEFAULT_SCOPE);
  return url.toString();
}

export function buildViktorTargetPath(location: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  if (
    !location.pathname.startsWith("/") ||
    location.pathname.startsWith("//")
  ) {
    return "/";
  }
  const search = location.search.startsWith("?") ? location.search : "";
  const hash = location.hash.startsWith("#") ? location.hash : "";
  return `${location.pathname}${search}${hash}`;
}

export async function beginViktorAuthentication(
  config: ViktorAuthConfig,
): Promise<void> {
  const state = createState();
  const pkce = await createPkcePair();
  writePkceCookie({
    state,
    verifier: pkce.verifier,
    targetPath:
      config.targetPath ??
      buildViktorTargetPath({
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      }),
  });
  markViktorAuthReturnPending(config.resourceId);
  window.location.assign(
    buildAuthorizeUrl({
      ...config,
      state,
      codeChallenge: pkce.challenge,
    }),
  );
}
