import { ApiError, getMe, type SessionUser } from "./api";

export type { SessionUser } from "./api";

let cachedUser: SessionUser | null | undefined;

export function setCurrentUser(user: SessionUser | null): void {
  cachedUser = user;
}

export function clearCurrentUser(): void {
  cachedUser = null;
}

export async function loadCurrentUser(
  force = false,
): Promise<SessionUser | null> {
  if (!force && cachedUser !== undefined) {
    return cachedUser;
  }

  try {
    const response = await getMe();
    cachedUser = response.user;
    return cachedUser;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      cachedUser = null;
      return null;
    }

    throw error;
  }
}
