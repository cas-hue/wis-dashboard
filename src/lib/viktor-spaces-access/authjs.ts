import {
  AUTHORIZATION_ENDPOINT,
  DEFAULT_SCOPE,
  TOKEN_ENDPOINT,
  USERINFO_ENDPOINT,
} from "./constants";

export type ViktorAuthJsProfile = {
  sub: string;
  email?: string | null;
  name?: string | null;
  preferred_username?: string | null;
  resource_type: string;
  resource_id: string;
  aud: string;
  policy_version?: number | null;
  permissions?: Record<string, unknown>;
};

export type ViktorAuthJsProvider = {
  id: "viktor";
  name: "Viktor";
  type: "oauth";
  clientId: string;
  client: {
    token_endpoint_auth_method: "none";
  };
  checks: ["pkce", "state"];
  idToken: false;
  authorization: {
    url: string;
    params: {
      scope: string;
      resource: string;
    };
  };
  token: string;
  userinfo: {
    url: string;
    request: (context: {
      tokens: {
        access_token?: string;
      };
    }) => Promise<ViktorAuthJsProfile>;
  };
  account: () => undefined;
  profile: (profile: ViktorAuthJsProfile) => {
    id: string;
    email?: string | null;
    name?: string | null;
    image: null;
    viktorResourceType: string;
    viktorResourceId: string;
    viktorResourceAudience: string;
    viktorPolicyVersion?: number | null;
    viktorPermissions?: Record<string, unknown>;
  };
};

export function createViktorAuthJsProvider(config: {
  clientId: string;
  resourceId: string;
  viktorAuthBaseUrl: string;
  scope?: string;
}): ViktorAuthJsProvider {
  const authBaseUrl = config.viktorAuthBaseUrl.replace(/\/$/, "");
  const resource = `space:${config.resourceId}`;
  const tokenUrl = new URL(`${authBaseUrl}${TOKEN_ENDPOINT}`);
  tokenUrl.searchParams.set("resource", resource);
  const userinfoUrl = `${authBaseUrl}${USERINFO_ENDPOINT}`;
  return {
    id: "viktor",
    name: "Viktor",
    type: "oauth",
    clientId: config.clientId,
    client: {
      token_endpoint_auth_method: "none",
    },
    checks: ["pkce", "state"],
    idToken: false,
    authorization: {
      url: `${authBaseUrl}${AUTHORIZATION_ENDPOINT}`,
      params: {
        scope: config.scope ?? DEFAULT_SCOPE,
        resource,
      },
    },
    token: tokenUrl.toString(),
    userinfo: {
      url: userinfoUrl,
      request: async ({ tokens }) => {
        const accessToken = tokens.access_token;
        if (!accessToken) {
          throw new Error("Viktor Auth.js provider requires an access token");
        }
        const response = await fetch(userinfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          throw new Error(`Viktor userinfo request failed: ${response.status}`);
        }
        return (await response.json()) as ViktorAuthJsProfile;
      },
    },
    account: () => undefined,
    profile: profile => ({
      id: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.preferred_username,
      image: null,
      viktorResourceType: profile.resource_type,
      viktorResourceId: profile.resource_id,
      viktorResourceAudience: profile.aud,
      viktorPolicyVersion: profile.policy_version,
      viktorPermissions: profile.permissions,
    }),
  };
}
