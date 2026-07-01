export type ViktorSpaceAccessAllow = "public" | "workspace_members";
export type ViktorSpaceAccessMode = "public" | "space_auth" | "viktor_auth";

export type ViktorAuthUser = {
  id: string;
  email?: string | null;
  display_name?: string | null;
};

export type ViktorAuthResource = {
  resource_type: "space";
  resource_id: string;
  audience: string;
  policy_version?: number | null;
  claims?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
};

export type ViktorAuthStatus =
  | { status: "loading" }
  | { status: "unauthenticated"; reason?: string | null }
  | { status: "allowed"; user: ViktorAuthUser; resource: ViktorAuthResource }
  | { status: "denied"; reason: string };

export type ViktorAuthSafeUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  resource?: ViktorAuthResource | null;
};

export type ViktorAuthSession = {
  user: ViktorAuthSafeUser;
  resource: ViktorAuthResource;
} | null;

export type ViktorAuthConfig = {
  clientId: string;
  resourceId: string;
  viktorAuthBaseUrl: string;
  redirectUri: string;
  targetPath?: string;
  scope?: string;
};

export type AuthorizeUrlConfig = ViktorAuthConfig & {
  state: string;
  codeChallenge: string;
};

export type PkcePair = {
  verifier: string;
  challenge: string;
};

export type ViktorAuthRoutesOptions = {
  clientId: string;
  resourceId: string;
  viktorAuthBaseUrl: string;
  successRedirectPath?: string;
  deniedRedirectPath?: string;
};
