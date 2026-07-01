import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SPACE_ME_PATH } from "./constants";
import type {
  ViktorAuthSafeUser,
  ViktorAuthSession,
  ViktorAuthStatus,
} from "./types";

export function toViktorSession(status: ViktorAuthStatus): ViktorAuthSession {
  if (status.status !== "allowed") {
    return null;
  }
  return {
    user: {
      id: status.user.id,
      email: status.user.email,
      name: status.user.display_name,
    },
    resource: status.resource,
  };
}

/**
 * Fetches the server-validated session from `/__viktor_auth/me`. Mounted
 * exactly once by `ViktorAuthAppRoutes`; everything below it must consume
 * the result via `useViktorSession()` instead of fetching `me` again.
 */
export function useViktorAuthSession(
  enabled: boolean,
): ViktorAuthSession | undefined {
  const [session, setSession] = useState<ViktorAuthSession | undefined>(
    enabled ? undefined : null,
  );

  useEffect(() => {
    if (!enabled) {
      setSession(null);
      return;
    }
    let cancelled = false;
    setSession(undefined);
    void fetch(SPACE_ME_PATH, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async response => {
        if (!response.ok) return null;
        const status = (await response.json()) as ViktorAuthStatus;
        return toViktorSession(status);
      })
      .catch(() => null)
      .then(nextSession => {
        if (!cancelled) {
          setSession(nextSession);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return session;
}

interface ViktorSessionContextValue {
  /** `undefined` while the `me` request is in flight, `null` when signed out. */
  session: ViktorAuthSession | undefined;
}

const ViktorSessionContext = createContext<ViktorSessionContextValue | null>(
  null,
);

export function ViktorSessionProvider({
  session,
  children,
}: {
  session: ViktorAuthSession | undefined;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ session }), [session]);
  return (
    <ViktorSessionContext.Provider value={value}>
      {children}
    </ViktorSessionContext.Provider>
  );
}

/**
 * Current Viktor session for pages and components in `viktor_auth` mode.
 * Backed by the single `/__viktor_auth/me` fetch in `ViktorAuthAppRoutes` —
 * do NOT fetch `SPACE_ME_PATH` directly in app code.
 */
export function useViktorSession(): {
  session: ViktorAuthSession;
  user: ViktorAuthSafeUser | null;
  isLoading: boolean;
} {
  const context = useContext(ViktorSessionContext);
  if (!context) {
    throw new Error(
      "useViktorSession must be used within ViktorAuthAppRoutes (viktor_auth mode)",
    );
  }
  return {
    session: context.session ?? null,
    user: context.session?.user ?? null,
    isLoading: context.session === undefined,
  };
}
