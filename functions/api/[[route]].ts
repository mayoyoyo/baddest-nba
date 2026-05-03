import app from "../../src/server/app";
import type { AppBindings } from "../../src/server/types";

export const onRequest = (context: {
  request: Request;
  env: AppBindings;
  waitUntil?: (promise: Promise<unknown>) => void;
}) => app.fetch(context.request, context.env, context as any);
