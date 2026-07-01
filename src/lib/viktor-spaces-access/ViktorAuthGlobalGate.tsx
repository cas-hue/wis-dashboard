import { type ReactNode, useEffect, useState } from "react";
import {
  clearViktorAuthReturnPending,
  readTrustedViktorSession,
  readViktorAuthReturnPending,
  writeTrustedViktorSession,
} from "./sessionMarkers";
import type { ViktorAuthSession } from "./types";
import { useViktorSpaceAccess } from "./ViktorSpaceAccessProvider";

export type { ViktorAuthSession } from "./types";

export function hasExpectedViktorSpaceSession(
  session: ViktorAuthSession | undefined,
  expectedSpaceId: string,
): boolean {
  return (
    !!expectedSpaceId &&
    session?.resource.resource_type === "space" &&
    session.resource.resource_id === expectedSpaceId &&
    session.resource.audience === `space:${expectedSpaceId}`
  );
}

export function shouldBeginViktorSpaceSignIn(
  mode: "public" | "space_auth" | "viktor_auth",
  session: ViktorAuthSession | undefined,
  expectedSpaceId: string,
): boolean {
  return (
    mode === "viktor_auth" &&
    session !== undefined &&
    !hasExpectedViktorSpaceSession(session, expectedSpaceId)
  );
}

export function shouldRenderViktorAuthChildren(
  mode: "public" | "space_auth" | "viktor_auth",
  session: ViktorAuthSession | undefined,
  expectedSpaceId: string,
  hadTrustedSession: boolean,
  hasPendingReturn = false,
): boolean {
  if (mode !== "viktor_auth") return true;
  if (hasExpectedViktorSpaceSession(session, expectedSpaceId)) return true;
  return session === undefined && (hadTrustedSession || hasPendingReturn);
}

function ViktorAuthLoading() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="font-semibold text-xl">Checking Viktor Space access</h1>
        <p className="mt-3 text-muted-foreground text-sm">
          Redirecting to Viktor sign-in if needed.
        </p>
      </div>
    </main>
  );
}

/**
 * UX gate only — NOT an authorization boundary. The localStorage trust and
 * pending-return markers merely decide whether to render the app shell while
 * the session revalidates; all data access must stay behind server-validated
 * sessions (`/__viktor_auth/me` and Convex functions).
 */
export function ViktorAuthGlobalGate({
  children,
  session,
  onSignInRequired,
}: {
  children: ReactNode;
  session?: ViktorAuthSession;
  onSignInRequired?: () => void;
}) {
  const { mode, spaceId } = useViktorSpaceAccess();
  const hasViktorSession = hasExpectedViktorSpaceSession(session, spaceId);
  const [hadTrustedSession, setHadTrustedSession] = useState(() =>
    readTrustedViktorSession(spaceId),
  );
  const [hasPendingReturn, setHasPendingReturn] = useState(() =>
    readViktorAuthReturnPending(spaceId),
  );

  useEffect(() => {
    if (shouldBeginViktorSpaceSignIn(mode, session, spaceId)) {
      onSignInRequired?.();
    }
  }, [mode, onSignInRequired, session, spaceId]);

  useEffect(() => {
    if (mode !== "viktor_auth") return;
    if (hasViktorSession) {
      clearViktorAuthReturnPending(spaceId);
      setHasPendingReturn(false);
      writeTrustedViktorSession(spaceId, true);
      setHadTrustedSession(true);
      return;
    }
    if (session === null) {
      clearViktorAuthReturnPending(spaceId);
      setHasPendingReturn(false);
      writeTrustedViktorSession(spaceId, false);
      setHadTrustedSession(false);
    }
  }, [hasViktorSession, mode, session, spaceId]);

  if (mode !== "viktor_auth") {
    return children;
  }

  if (
    shouldRenderViktorAuthChildren(
      mode,
      session,
      spaceId,
      hadTrustedSession,
      hasPendingReturn,
    )
  ) {
    return children;
  }

  return <ViktorAuthLoading />;
}
