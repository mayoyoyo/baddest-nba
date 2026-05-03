const SESSION_COOKIE_NAME = "session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function serializeCookie(attributes: string[]): string {
  return attributes.filter(Boolean).join("; ");
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const [name, ...valueParts] = part.split("=");
      if (!name || valueParts.length === 0) {
        return cookies;
      }

      cookies[name] = decodeURIComponent(valueParts.join("="));
      return cookies;
    }, {});
}

export function getSessionToken(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

export function shouldUseSecureCookies(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

export function createSessionCookie(token: string, secure: boolean): string {
  return serializeCookie([
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]);
}

export function clearSessionCookie(secure: boolean): string {
  return serializeCookie([
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]);
}
