import { useCallback, useRef } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { PublicHeader } from "@/components/PublicHeader";
import { beginViktorAuthentication } from "@/lib/viktor-spaces-access/client";
import {
  getViktorAuthBaseUrl,
  getViktorAuthClientId,
  getViktorSpacesSpaceId,
} from "@/lib/viktor-spaces-access/config";
import { SPACE_CALLBACK_PATH } from "@/lib/viktor-spaces-access/constants";
import type { ViktorAuthSession } from "@/lib/viktor-spaces-access/types";
import { ViktorAuthGlobalGate } from "@/lib/viktor-spaces-access/ViktorAuthGlobalGate";
import { ViktorProductAuthProvider } from "@/lib/viktor-spaces-access/ViktorProductAuthProvider";
import {
  useViktorAuthSession,
  ViktorSessionProvider,
} from "@/lib/viktor-spaces-access/ViktorSessionProvider";
import { ViktorSpaceAccessProvider } from "@/lib/viktor-spaces-access/ViktorSpaceAccessProvider";
import { PublicLandingPage } from "@/pages/PublicLandingPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ProductAuthRoutes } from "../space-auth/SpaceAuthAppRoutes";

function ViktorPublicShell() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function ViktorAppShell() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">W</div>
          <span className="font-semibold text-sm">WorkinSociety</span>
        </div>
        <span className="text-muted-foreground text-xs ml-2">Recruitment Dashboard</span>
      </header>
      <main className="p-4 lg:p-8 max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}


export function ViktorAuthAppRoutes({
  session,
  onSignInRequired,
  productAuthEnabled = false,
}: {
  session?: ViktorAuthSession;
  onSignInRequired?: () => void;
  productAuthEnabled?: boolean;
}) {
  const fetchedSession = useViktorAuthSession(session === undefined);
  const activeSession = session === undefined ? fetchedSession : session;
  const startedSignIn = useRef(false);
  const beginSignIn = useCallback(() => {
    if (startedSignIn.current) return;
    startedSignIn.current = true;
    if (onSignInRequired) {
      onSignInRequired();
      return;
    }
    const resourceId = getViktorSpacesSpaceId();
    const clientId = getViktorAuthClientId();
    const viktorAuthBaseUrl = getViktorAuthBaseUrl();
    if (!resourceId || !clientId || !viktorAuthBaseUrl) {
      return;
    }
    void beginViktorAuthentication({
      clientId,
      resourceId,
      viktorAuthBaseUrl,
      redirectUri: `${window.location.origin}${SPACE_CALLBACK_PATH}`,
    });
  }, [onSignInRequired]);

  return (
    <ViktorSpaceAccessProvider>
      <ViktorSessionProvider session={activeSession}>
        <ViktorAuthGlobalGate
          session={activeSession}
          onSignInRequired={beginSignIn}
        >
          {productAuthEnabled ? (
            <ViktorProductAuthProvider enabled>
              <ProductAuthRoutes />
            </ViktorProductAuthProvider>
          ) : (
            <Routes>
              <Route element={<ViktorPublicShell />}>
                <Route path="/" element={<PublicLandingPage />} />
              </Route>

              <Route element={<ViktorAppShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          )}
        </ViktorAuthGlobalGate>
      </ViktorSessionProvider>
    </ViktorSpaceAccessProvider>
  );
}
