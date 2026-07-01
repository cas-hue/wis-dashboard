declare const process: { env: Record<string, string | undefined> };

export function configuredProductAuthEnabled(): boolean {
  const configured =
    process.env.VIKTOR_SPACES_ACCESS_MODE ||
    process.env.VITE_VIKTOR_SPACES_ACCESS_MODE;
  if (configured === "space_auth") return true;
  if (configured === "public" || configured === "viktor_auth") return false;

  if (!configured) {
    throw new Error(
      "Missing required Viktor Spaces env var: VIKTOR_SPACES_ACCESS_MODE",
    );
  }
  throw new Error(`Invalid VIKTOR_SPACES_ACCESS_MODE: ${configured}`);
}
