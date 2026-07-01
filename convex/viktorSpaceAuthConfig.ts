import { Password } from "@convex-dev/auth/providers/Password";
import type { AuthProviderConfig } from "@convex-dev/auth/server";
import { TestCredentials } from "./testAuth";
import {
  ViktorSpacesEmail,
  ViktorSpacesPasswordReset,
} from "./ViktorSpacesEmail";
import { configuredProductAuthEnabled } from "./viktorSpaceAuthEnv";

declare const process: { env: Record<string, string | undefined> };

function configuredSpaceAuthProviders(): AuthProviderConfig[] {
  return [
    Password({
      verify: ViktorSpacesEmail,
      reset: ViktorSpacesPasswordReset,
    }),
    ...(process.env.VIKTOR_SPACES_IS_PREVIEW === "true"
      ? [TestCredentials]
      : []),
  ];
}

export function configuredAuthProviders(): AuthProviderConfig[] {
  return configuredProductAuthEnabled() ? configuredSpaceAuthProviders() : [];
}
