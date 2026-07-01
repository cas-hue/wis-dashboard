import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  getViktorSpaceAccessAllow,
  getViktorSpaceAccessMode,
  getViktorSpacesAuthEnabled,
  getViktorSpacesSpaceId,
  shouldRequireViktorSpaceAccess,
} from "./config";
import type { ViktorSpaceAccessAllow, ViktorSpaceAccessMode } from "./types";

interface ViktorSpaceAccessContextValue {
  mode: ViktorSpaceAccessMode;
  accessAllow: ViktorSpaceAccessAllow[];
  authEnabled: boolean;
  requiresViktorAccess: boolean;
  spaceId: string;
}

const ViktorSpaceAccessContext =
  createContext<ViktorSpaceAccessContextValue | null>(null);

export function ViktorSpaceAccessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const mode = getViktorSpaceAccessMode();
  const accessAllow = getViktorSpaceAccessAllow();
  const authEnabled = getViktorSpacesAuthEnabled();
  const requiresViktorAccess = shouldRequireViktorSpaceAccess();
  const spaceId = getViktorSpacesSpaceId();
  const value = useMemo(
    () => ({ mode, accessAllow, authEnabled, requiresViktorAccess, spaceId }),
    [mode, accessAllow, authEnabled, requiresViktorAccess, spaceId],
  );

  return (
    <ViktorSpaceAccessContext.Provider value={value}>
      {children}
    </ViktorSpaceAccessContext.Provider>
  );
}

export function useViktorSpaceAccess() {
  const context = useContext(ViktorSpaceAccessContext);
  if (!context) {
    throw new Error(
      "useViktorSpaceAccess must be used within ViktorSpaceAccessProvider",
    );
  }
  return context;
}
