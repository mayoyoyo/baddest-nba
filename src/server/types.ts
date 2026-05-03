import type { DbClient } from "./lib/db.js";
import type { SessionRow, UserRow } from "./repositories/usersRepo.js";

export interface AuthViewer {
  session: SessionRow;
  user: UserRow;
}

export interface AppBindings {
  DB?: D1Database;
  IMAGES_BUCKET?: R2Bucket;
  SIGNUPS_OPEN?: string;
  TURNSTILE_BYPASS?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export type AppEnv = {
  Bindings: AppBindings;
  Variables: {
    db: DbClient | null;
    viewer: AuthViewer | null;
  };
};

export interface SessionUser {
  id: string;
  username: string;
  role: UserRow["role"];
}
