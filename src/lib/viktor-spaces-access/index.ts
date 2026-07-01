export { AuthStrategyRoutes } from "../../auth/AuthStrategyRoutes";
export { PublicAppRoutes } from "../../auth/public/PublicAppRoutes";
export { SpaceAuthAppRoutes } from "../../auth/space-auth/SpaceAuthAppRoutes";
export { ViktorAuthAppRoutes } from "../../auth/viktor-auth/ViktorAuthAppRoutes";
export type { ViktorAuthJsProfile, ViktorAuthJsProvider } from "./authjs";
export { createViktorAuthJsProvider } from "./authjs";
export { beginViktorAuthentication, buildAuthorizeUrl } from "./client";
export * from "./constants";
export { createViktorAuthRoutes } from "./server";
export type {
  AuthorizeUrlConfig,
  PkcePair,
  ViktorAuthConfig,
  ViktorAuthResource,
  ViktorAuthRoutesOptions,
  ViktorAuthSafeUser,
  ViktorAuthSession,
  ViktorAuthStatus,
  ViktorAuthUser,
  ViktorSpaceAccessAllow,
  ViktorSpaceAccessMode,
} from "./types";
export {
  hasExpectedViktorSpaceSession,
  shouldBeginViktorSpaceSignIn,
  ViktorAuthGlobalGate,
} from "./ViktorAuthGlobalGate";
export { ViktorProductAuthProvider } from "./ViktorProductAuthProvider";
export {
  toViktorSession,
  useViktorAuthSession,
  useViktorSession,
  ViktorSessionProvider,
} from "./ViktorSessionProvider";
export {
  useViktorSpaceAccess,
  ViktorSpaceAccessProvider,
} from "./ViktorSpaceAccessProvider";
