import { lazy, Suspense } from "react";
import {
  useViktorSpaceAccess,
  ViktorSpaceAccessProvider,
} from "@/lib/viktor-spaces-access/ViktorSpaceAccessProvider";

const PublicAppRoutes = lazy(() =>
  import("./public/PublicAppRoutes").then(module => ({
    default: module.PublicAppRoutes,
  })),
);
const SpaceAuthAppRoutes = lazy(() =>
  import("./space-auth/SpaceAuthAppRoutes").then(module => ({
    default: module.SpaceAuthAppRoutes,
  })),
);
const ViktorAuthAppRoutes = lazy(() =>
  import("./viktor-auth/ViktorAuthAppRoutes").then(module => ({
    default: module.ViktorAuthAppRoutes,
  })),
);

function AuthStrategyLoading() {
  return null;
}

export function AuthStrategyRoutes() {
  return (
    <ViktorSpaceAccessProvider>
      <AuthStrategyRoutesInner />
    </ViktorSpaceAccessProvider>
  );
}

function AuthStrategyRoutesInner() {
  const { authEnabled, requiresViktorAccess } = useViktorSpaceAccess();

  const routes = requiresViktorAccess ? (
    <ViktorAuthAppRoutes productAuthEnabled={authEnabled} />
  ) : authEnabled ? (
    <SpaceAuthAppRoutes />
  ) : (
    <PublicAppRoutes />
  );

  return <Suspense fallback={<AuthStrategyLoading />}>{routes}</Suspense>;
}
