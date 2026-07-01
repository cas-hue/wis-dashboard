const TRUSTED_SESSION_PREFIX = "viktor-space-auth:trusted:";
const PENDING_RETURN_PREFIX = "viktor-space-auth:pending-return:";
const PENDING_RETURN_TTL_MS = 10 * 60 * 1000;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function trustedSessionKey(spaceId: string): string {
  return `${TRUSTED_SESSION_PREFIX}${spaceId}`;
}

function pendingReturnKey(spaceId: string): string {
  return `${PENDING_RETURN_PREFIX}${spaceId}`;
}

export function readTrustedViktorSession(spaceId: string): boolean {
  if (!spaceId) return false;
  return storage()?.getItem(trustedSessionKey(spaceId)) === "1";
}

export function writeTrustedViktorSession(
  spaceId: string,
  trusted: boolean,
): void {
  const localStorage = storage();
  if (!spaceId || !localStorage) return;
  if (trusted) {
    localStorage.setItem(trustedSessionKey(spaceId), "1");
    return;
  }
  localStorage.removeItem(trustedSessionKey(spaceId));
}

export function markViktorAuthReturnPending(spaceId: string): void {
  const localStorage = storage();
  if (!spaceId || !localStorage) return;
  localStorage.setItem(pendingReturnKey(spaceId), String(Date.now()));
}

export function clearViktorAuthReturnPending(spaceId: string): void {
  if (!spaceId) return;
  storage()?.removeItem(pendingReturnKey(spaceId));
}

export function readViktorAuthReturnPending(spaceId: string): boolean {
  const value = spaceId ? storage()?.getItem(pendingReturnKey(spaceId)) : null;
  if (!value) return false;
  const startedAt = Number(value);
  if (
    !Number.isFinite(startedAt) ||
    Date.now() - startedAt > PENDING_RETURN_TTL_MS
  ) {
    clearViktorAuthReturnPending(spaceId);
    return false;
  }
  return true;
}
