import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createViktorAuthJsProvider } from "../src/lib/viktor-spaces-access/authjs";
import { buildViktorTargetPath } from "../src/lib/viktor-spaces-access/client";
import {
  getViktorSpaceAccessAllow,
  getViktorSpaceAccessMode,
  getViktorSpacesAuthEnabled,
} from "../src/lib/viktor-spaces-access/config";
import { createViktorAuthRoutes } from "../src/lib/viktor-spaces-access/server";
import type {
  ViktorAuthResource,
  ViktorAuthSafeUser,
  ViktorSpaceAccessMode,
} from "../src/lib/viktor-spaces-access/types";
import {
  hasExpectedViktorSpaceSession,
  shouldBeginViktorSpaceSignIn,
  shouldRenderViktorAuthChildren,
} from "../src/lib/viktor-spaces-access/ViktorAuthGlobalGate";
import {
  useViktorSession,
  ViktorSessionProvider,
} from "../src/lib/viktor-spaces-access/ViktorSessionProvider";

let convexAuthState = { isAuthenticated: false, isLoading: false };
let viktorAuthSession:
  | { user: ViktorAuthSafeUser; resource: ViktorAuthResource }
  | null
  | undefined = null;
let convexAuthProviderRenderCount = 0;
const signInMock = mock(async () => ({ signingIn: true }));
const fetchMock = mock();
globalThis.fetch = fetchMock as typeof fetch;
const currentUserQuery = Symbol("currentUser");
const deleteAccountMutation = Symbol("deleteAccount");
const apiMock = {
  api: {
    auth: {
      currentUser: currentUserQuery,
    },
    users: {
      deleteAccount: deleteAccountMutation,
    },
  },
};

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
});

mock.module("convex/react", () => ({
  ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => children,
  ConvexReactClient: class {},
  useMutation: () => mock(async () => null),
  useConvexAuth: () => convexAuthState,
  useQuery: () => null,
}));

mock.module("@convex-dev/auth/react", () => ({
  ConvexAuthProvider: ({ children }: { children: ReactNode }) => {
    convexAuthProviderRenderCount += 1;
    return children;
  },
  useAuthActions: () => ({
    signIn: signInMock,
    signOut: mock(async () => null),
  }),
}));

mock.module("../convex/_generated/api", () => apiMock);
mock.module("../../convex/_generated/api", () => apiMock);
mock.module("../../../convex/_generated/api", () => apiMock);

beforeEach(() => {
  convexAuthState = { isAuthenticated: false, isLoading: false };
  viktorAuthSession = null;
  convexAuthProviderRenderCount = 0;
  signInMock.mockClear();
  fetchMock.mockReset();
  delete process.env.VIKTOR_SPACES_ACCESS_MODE;
  delete process.env.VIKTOR_SPACES_IS_PREVIEW;
  process.env.VITE_VIKTOR_SPACES_ACCESS_MODE = "space_auth";
  process.env.VITE_VIKTOR_SPACES_SPACE_ID = "space_stable_123";
});

function configureAccessMode(mode: ViktorSpaceAccessMode): void {
  process.env.VITE_VIKTOR_SPACES_ACCESS_MODE = mode;
}

function expectedViktorSession(spaceId = "space_stable_123") {
  return {
    user: {
      id: "user_1",
      email: "member@example.com",
      name: "Workspace Member",
    },
    resource: {
      resource_type: "space" as const,
      resource_id: spaceId,
      audience: `space:${spaceId}`,
      policy_version: 1,
      permissions: { can_read: true },
    },
  };
}

async function renderProtectedRoute(
  mode: ViktorSpaceAccessMode,
): Promise<string> {
  configureAccessMode(mode);
  const { ProtectedRoute } = await import("../src/components/ProtectedRoute");
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

async function renderAppRoute(
  mode: ViktorSpaceAccessMode,
  path: string,
): Promise<string> {
  configureAccessMode(mode);
  if (mode === "space_auth") {
    const { SpaceAuthAppRoutes } = await import(
      "../src/auth/space-auth/SpaceAuthAppRoutes"
    );
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={[path]}>
        <SpaceAuthAppRoutes />
      </MemoryRouter>,
    );
  }
  if (mode === "viktor_auth") {
    const { ViktorAuthAppRoutes } = await import(
      "../src/auth/viktor-auth/ViktorAuthAppRoutes"
    );
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={[path]}>
        <ViktorAuthAppRoutes />
      </MemoryRouter>,
    );
  }
  const { PublicAppRoutes } = await import(
    "../src/auth/public/PublicAppRoutes"
  );
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <PublicAppRoutes />
    </MemoryRouter>,
  );
}

async function renderViktorAuthRoute(
  path: string,
  session = viktorAuthSession,
): Promise<string> {
  configureAccessMode("viktor_auth");
  const { ViktorAuthAppRoutes } = await import(
    "../src/auth/viktor-auth/ViktorAuthAppRoutes"
  );
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <ViktorAuthAppRoutes session={session} />
    </MemoryRouter>,
  );
}

describe("Viktor Spaces Auth.js template contract", () => {
  test("public mode uses a route entrypoint with no auth providers", async () => {
    const html = await renderAppRoute("public", "/");

    expect(html).toContain("Main Headline");
    expect(html).not.toContain("Checking Viktor Space access");
    expect(html).not.toContain("Sign In");
    expect(html).not.toContain("Get Started");
    expect(convexAuthProviderRenderCount).toBe(0);
  });

  test("missing access mode env fails loudly", async () => {
    expect(() =>
      getViktorSpaceAccessMode({
        VITE_VIKTOR_SPACES_SPACE_ID: "space_stable_123",
      }),
    ).toThrow("Missing required Viktor Spaces env var");
  });

  test("invalid access mode env fails loudly", async () => {
    expect(() =>
      getViktorSpaceAccessMode({
        VITE_VIKTOR_SPACES_ACCESS_MODE: "everyone",
        VITE_VIKTOR_SPACES_SPACE_ID: "space_stable_123",
      }),
    ).toThrow("Invalid VITE_VIKTOR_SPACES_ACCESS_MODE");
  });

  test("access mode env drives the supported auth strategies", () => {
    expect(
      getViktorSpaceAccessMode({
        VITE_VIKTOR_SPACES_ACCESS_MODE: "public",
        VITE_VIKTOR_SPACES_SPACE_ID: "space_stable_123",
      }),
    ).toBe("public");
    expect(
      getViktorSpaceAccessMode({
        VITE_VIKTOR_SPACES_ACCESS_MODE: "space_auth",
        VITE_VIKTOR_SPACES_SPACE_ID: "space_stable_123",
      }),
    ).toBe("space_auth");
    expect(
      getViktorSpaceAccessMode({
        VITE_VIKTOR_SPACES_ACCESS_MODE: "viktor_auth",
        VITE_VIKTOR_SPACES_SPACE_ID: "space_stable_123",
      }),
    ).toBe("viktor_auth");
  });

  test("access helpers derive compatibility fields from mode", () => {
    const env = {
      VITE_VIKTOR_SPACES_ACCESS_MODE: "viktor_auth",
      VITE_VIKTOR_SPACES_SPACE_ID: "space_stable_123",
    };

    expect(getViktorSpaceAccessAllow(env)).toEqual(["workspace_members"]);
    expect(getViktorSpacesAuthEnabled(env)).toBe(false);
  });

  test("Convex auth provider registration follows access mode", async () => {
    const { configuredProductAuthEnabled } = await import(
      "../convex/viktorSpaceAuthEnv"
    );

    process.env.VIKTOR_SPACES_ACCESS_MODE = "viktor_auth";
    expect(configuredProductAuthEnabled()).toBe(false);

    process.env.VIKTOR_SPACES_ACCESS_MODE = "space_auth";
    expect(configuredProductAuthEnabled()).toBe(true);
  });

  test("Convex auth provider registration requires access mode", async () => {
    const { configuredProductAuthEnabled } = await import(
      "../convex/viktorSpaceAuthEnv"
    );

    delete process.env.VIKTOR_SPACES_ACCESS_MODE;
    delete process.env.VITE_VIKTOR_SPACES_ACCESS_MODE;
    expect(() => configuredProductAuthEnabled()).toThrow(
      "Missing required Viktor Spaces env var",
    );

    process.env.VIKTOR_SPACES_ACCESS_MODE = "sometimes";
    expect(() => configuredProductAuthEnabled()).toThrow(
      "Invalid VIKTOR_SPACES_ACCESS_MODE",
    );
  });

  test("space_auth route primitive preserves existing Convex auth behavior", async () => {
    convexAuthState = { isAuthenticated: true, isLoading: false };
    const authenticatedHtml = await renderProtectedRoute("space_auth");

    expect(authenticatedHtml).toContain("Dashboard content");

    convexAuthState = { isAuthenticated: false, isLoading: false };
    const unauthenticatedHtml = await renderProtectedRoute("space_auth");

    expect(unauthenticatedHtml).not.toContain("Dashboard content");
  });

  test("space_auth owns its Convex Auth provider", async () => {
    const html = await renderAppRoute("space_auth", "/login");

    expect(html).toContain("Sign In");
    expect(convexAuthProviderRenderCount).toBe(1);
  });

  test("viktor_auth route entrypoint does not use Convex Auth or space_auth primitives", async () => {
    const protectedHtml = await renderAppRoute("viktor_auth", "/dashboard");
    const publicOnlyHtml = await renderAppRoute("viktor_auth", "/login");

    expect(protectedHtml).toContain("Checking Viktor Space access");
    expect(publicOnlyHtml).toContain("Checking Viktor Space access");
    expect(publicOnlyHtml).not.toContain("Login content");
    expect(convexAuthProviderRenderCount).toBe(0);
  });

  test("viktor_auth globally gates every route until a Viktor resource session exists", async () => {
    const publicHtml = await renderAppRoute("public", "/");
    expect(publicHtml).toContain("Main Headline");

    for (const path of ["/", "/login", "/signup", "/unknown"]) {
      const viktorAuthHtml = await renderAppRoute("viktor_auth", path);
      expect(viktorAuthHtml).toContain("Checking Viktor Space access");
      expect(viktorAuthHtml).not.toContain("Main Headline");
      expect(viktorAuthHtml).not.toContain("Sign In");
      expect(viktorAuthHtml).not.toContain("Get Started");
    }
  });

  test("viktor_auth does not accept a generic Convex Auth session", async () => {
    convexAuthState = { isAuthenticated: true, isLoading: false };
    viktorAuthSession = null;

    const html = await renderViktorAuthRoute("/dashboard");

    expect(html).toContain("Checking Viktor Space access");
    expect(html).not.toContain("Dashboard");
    expect(convexAuthProviderRenderCount).toBe(0);
  });

  test("viktor_auth renders app routes after the expected Viktor resource session exists", async () => {
    viktorAuthSession = expectedViktorSession();

    const html = await renderViktorAuthRoute("/dashboard");

    expect(html).toContain("Dashboard");
    expect(html).not.toContain("Checking Viktor Space access");
    expect(convexAuthProviderRenderCount).toBe(0);
  });

  test("viktor_auth can wrap the product auth app after Viktor access succeeds", async () => {
    convexAuthState = { isAuthenticated: false, isLoading: false };
    const { ViktorAuthAppRoutes } = await import(
      "../src/auth/viktor-auth/ViktorAuthAppRoutes"
    );

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/login"]}>
        <ViktorAuthAppRoutes
          productAuthEnabled
          session={expectedViktorSession()}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Sign In");
    expect(html).not.toContain("Checking Viktor Space access");
    expect(convexAuthProviderRenderCount).toBe(1);
  });

  test("viktor_auth shares the session with pages without an extra me fetch", async () => {
    viktorAuthSession = expectedViktorSession();

    const html = await renderViktorAuthRoute("/dashboard");

    expect(html).toContain("Signed in as Workspace Member");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("useViktorSession exposes loading, signed-out, and session states", () => {
    function Probe() {
      const { user, session, isLoading } = useViktorSession();
      if (isLoading) return <span>probe:loading</span>;
      if (!user) return <span>probe:signed-out</span>;
      return (
        <span>
          probe:{user.name}:{session?.resource.resource_id}
        </span>
      );
    }

    expect(
      renderToStaticMarkup(
        <ViktorSessionProvider session={undefined}>
          <Probe />
        </ViktorSessionProvider>,
      ),
    ).toContain("probe:loading");
    expect(
      renderToStaticMarkup(
        <ViktorSessionProvider session={null}>
          <Probe />
        </ViktorSessionProvider>,
      ),
    ).toContain("probe:signed-out");
    expect(
      renderToStaticMarkup(
        <ViktorSessionProvider session={expectedViktorSession()}>
          <Probe />
        </ViktorSessionProvider>,
      ),
    ).toContain("probe:Workspace Member:space_stable_123");
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "useViktorSession must be used within ViktorAuthAppRoutes",
    );
  });

  test("viktor_auth rejects a Viktor session for a different Space", async () => {
    viktorAuthSession = expectedViktorSession("space_other");

    const html = await renderViktorAuthRoute("/dashboard");

    expect(html).toContain("Checking Viktor Space access");
    expect(html).not.toContain("Dashboard");
    expect(convexAuthProviderRenderCount).toBe(0);
  });

  test("viktor_auth can render stale trusted routes while session revalidates", () => {
    expect(
      shouldRenderViktorAuthChildren(
        "viktor_auth",
        undefined,
        "space_stable_123",
        false,
      ),
    ).toBe(false);
    expect(
      shouldRenderViktorAuthChildren(
        "viktor_auth",
        undefined,
        "space_stable_123",
        true,
      ),
    ).toBe(true);
    expect(
      shouldRenderViktorAuthChildren(
        "viktor_auth",
        expectedViktorSession(),
        "space_stable_123",
        false,
      ),
    ).toBe(true);
    expect(
      shouldRenderViktorAuthChildren(
        "viktor_auth",
        null,
        "space_stable_123",
        true,
      ),
    ).toBe(false);
    expect(
      shouldRenderViktorAuthChildren(
        "viktor_auth",
        undefined,
        "space_stable_123",
        false,
        true,
      ),
    ).toBe(true);
  });

  test("Viktor OAuth state preserves the requested Space target path", () => {
    expect(
      buildViktorTargetPath({
        pathname: "/dashboard",
        search: "?tab=usage",
        hash: "#credits",
      }),
    ).toBe("/dashboard?tab=usage#credits");
    expect(
      buildViktorTargetPath({
        pathname: "https://evil.example/dashboard",
        search: "",
        hash: "",
      }),
    ).toBe("/");
  });

  test("Viktor callback redirects to the preserved Space target path", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          session_token: "space-session",
          sid: "sid_1",
        }),
        { status: 200 },
      ),
    );
    const routes = createViktorAuthRoutes({
      clientId: "space-client",
      resourceId: "space_stable_123",
      viktorAuthBaseUrl: "https://auth.example",
    });
    const pkce = encodeURIComponent(
      JSON.stringify({
        state: "state_1",
        verifier: "verifier_1",
        targetPath: "/dashboard?tab=usage",
      }),
    );

    const response = await routes.callback(
      new Request(
        "https://space.example/__viktor_auth/callback?code=code_1&state=state_1",
        {
          headers: {
            cookie: `viktor_auth_pkce=${pkce}`,
          },
        },
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://space.example/dashboard?tab=usage",
    );
  });

  test("sign-in decision waits for expected resource sessions", () => {
    expect(
      shouldBeginViktorSpaceSignIn("viktor_auth", null, "space_stable_123"),
    ).toBe(true);
    expect(
      shouldBeginViktorSpaceSignIn(
        "viktor_auth",
        undefined,
        "space_stable_123",
      ),
    ).toBe(false);
    expect(
      shouldBeginViktorSpaceSignIn(
        "viktor_auth",
        expectedViktorSession(),
        "space_stable_123",
      ),
    ).toBe(false);
    expect(
      shouldBeginViktorSpaceSignIn("space_auth", null, "space_stable_123"),
    ).toBe(false);
    expect(
      shouldBeginViktorSpaceSignIn("public", null, "space_stable_123"),
    ).toBe(false);
  });

  test("Viktor resource session validation requires the expected Space audience", () => {
    expect(
      hasExpectedViktorSpaceSession(
        expectedViktorSession(),
        "space_stable_123",
      ),
    ).toBe(true);
    expect(
      hasExpectedViktorSpaceSession(
        expectedViktorSession("space_other"),
        "space_stable_123",
      ),
    ).toBe(false);
    expect(
      hasExpectedViktorSpaceSession(
        {
          ...expectedViktorSession(),
          resource: {
            ...expectedViktorSession().resource,
            audience: "space:space_other",
          },
        },
        "space_stable_123",
      ),
    ).toBe(false);
    expect(hasExpectedViktorSpaceSession(null, "space_stable_123")).toBe(false);
  });

  test("custom Auth.js provider preserves resource and keeps token exchange server-side", () => {
    const provider = createViktorAuthJsProvider({
      clientId: "space-client",
      resourceId: "space_123",
      viktorAuthBaseUrl: "https://auth.example",
    });

    expect(provider.id).toBe("viktor");
    expect(provider.checks).toEqual(["pkce", "state"]);
    expect(provider.client.token_endpoint_auth_method).toBe("none");
    expect(provider.authorization.params.resource).toBe("space:space_123");
    expect(provider.token).toBe(
      "https://auth.example/api/viktor-auth/token?resource=space%3Aspace_123",
    );
    expect(provider.userinfo.url).toBe(
      "https://auth.example/api/viktor-auth/userinfo",
    );
    expect(provider.account()).toBeUndefined();
  });

  test("provider profile returns browser-safe resource metadata without Viktor tokens", () => {
    const provider = createViktorAuthJsProvider({
      clientId: "space-client",
      resourceId: "space_123",
      viktorAuthBaseUrl: "https://auth.example",
    });
    const profile = provider.profile({
      sub: "user_1",
      email: "member@example.com",
      name: "Workspace Member",
      resource_type: "space",
      resource_id: "space_123",
      aud: "space:space_123",
      policy_version: 3,
      permissions: {
        can_read: true,
        can_use_session: true,
        space_role: "workspace_member",
      },
    });

    expect(profile).toEqual({
      id: "user_1",
      email: "member@example.com",
      name: "Workspace Member",
      image: null,
      viktorResourceType: "space",
      viktorResourceId: "space_123",
      viktorResourceAudience: "space:space_123",
      viktorPolicyVersion: 3,
      viktorPermissions: {
        can_read: true,
        can_use_session: true,
        space_role: "workspace_member",
      },
    });
    expect(JSON.stringify(profile)).not.toContain("access_token");
    expect(JSON.stringify(profile)).not.toContain("refresh_token");
  });

  test("provider userinfo loads profile with bearer token and fails closed without one", async () => {
    const provider = createViktorAuthJsProvider({
      clientId: "space-client",
      resourceId: "space_123",
      viktorAuthBaseUrl: "https://auth.example",
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sub: "user_1",
          resource_type: "space",
          resource_id: "space_123",
          aud: "space:space_123",
        }),
        { status: 200 },
      ),
    );

    await expect(
      provider.userinfo.request({ tokens: { access_token: "access-token" } }),
    ).resolves.toEqual({
      sub: "user_1",
      resource_type: "space",
      resource_id: "space_123",
      aud: "space:space_123",
    });
    expect(fetchMock.mock.calls[0]).toEqual([
      "https://auth.example/api/viktor-auth/userinfo",
      { headers: { Authorization: "Bearer access-token" } },
    ]);

    await expect(provider.userinfo.request({ tokens: {} })).rejects.toThrow(
      "requires an access token",
    );
  });

  test("Viktor callback denied branch ignores untrusted space_origin", async () => {
    const routes = createViktorAuthRoutes({
      clientId: "space-client",
      resourceId: "space_stable_123",
      viktorAuthBaseUrl: "https://auth.example",
    });

    const response = await routes.callback(
      new Request(
        `https://space.example/__viktor_auth/callback?error=access_denied&space_origin=${encodeURIComponent("https://evil.example")}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://space.example/__viktor_auth/denied?reason=access_denied",
    );
  });

  test("Viktor auth routes honor the deploy-injected viktor.space origin", async () => {
    const routes = createViktorAuthRoutes({
      clientId: "space-client",
      resourceId: "space_stable_123",
      viktorAuthBaseUrl: "https://auth.example",
    });

    const response = await routes.callback(
      new Request(
        `https://backend.convex.site/__viktor_auth/callback?error=access_denied&space_origin=${encodeURIComponent("https://demo.viktor.space")}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://demo.viktor.space/__viktor_auth/denied?reason=access_denied",
    );
  });

  test("PKCE cookie is marked Secure on https origins only", async () => {
    const documentStub = { cookie: "" };
    const windowStub = { location: { protocol: "https:" } };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: documentStub,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: windowStub,
    });
    const { writePkceCookie } = await import(
      "../src/lib/viktor-spaces-access/pkce"
    );

    writePkceCookie({ state: "state_1", verifier: "verifier_1" });
    expect(documentStub.cookie).toContain("Secure");
    expect(documentStub.cookie).toContain("SameSite=Lax");
    expect(documentStub.cookie).toContain("Path=/__viktor_auth");

    windowStub.location.protocol = "http:";
    writePkceCookie({ state: "state_1", verifier: "verifier_1" });
    expect(documentStub.cookie).not.toContain("Secure");
  });
});
