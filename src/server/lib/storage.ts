import { createClient } from "@supabase/supabase-js";
import type { AppBindings } from "../types.js";

const SUPABASE_IMAGE_BUCKET = "images";

export interface StorageObject {
  body: ReadableStream<Uint8Array> | null;
  contentType: string | null;
}

export interface StorageClient {
  get(key: string): Promise<StorageObject | null>;
  put(key: string, value: Blob, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export function buildImageObjectKey(
  imageId: string,
  variant: "display" | "original",
): string {
  return `images/${encodeURIComponent(imageId)}/${variant}`;
}

function readRequiredProcessEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required for Supabase storage`);
  }

  return value;
}

function createR2StorageClient(bucket: R2Bucket): StorageClient {
  return {
    async put(key: string, value: Blob, contentType: string): Promise<void> {
      await bucket.put(key, value, {
        httpMetadata: {
          contentType,
        },
      });
    },

    async get(key: string): Promise<StorageObject | null> {
      const object = await bucket.get(key);
      if (!object) {
        return null;
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);

      return {
        body: object.body,
        contentType: headers.get("content-type"),
      };
    },

    async remove(keys: string[]): Promise<void> {
      await bucket.delete(keys);
    },
  };
}

let runtimeStorageClient: StorageClient | null = null;

function createSupabaseStorageClient(): StorageClient {
  const supabase = createClient(
    readRequiredProcessEnv("SUPABASE_URL"),
    readRequiredProcessEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return {
    async put(key: string, value: Blob, contentType: string): Promise<void> {
      const { error } = await supabase.storage
        .from(SUPABASE_IMAGE_BUCKET)
        .upload(key, value, {
          contentType,
          upsert: false,
        });

      if (error) {
        throw new Error(error.message);
      }
    },

    async get(key: string): Promise<StorageObject | null> {
      const { data, error } = await supabase.storage
        .from(SUPABASE_IMAGE_BUCKET)
        .download(key);

      if (error) {
        if (
          error.message.toLowerCase().includes("not found") ||
          error.message.toLowerCase().includes("does not exist")
        ) {
          return null;
        }

        throw new Error(error.message);
      }

      return {
        body: data.stream(),
        contentType: data.type || null,
      };
    },

    async remove(keys: string[]): Promise<void> {
      const { error } = await supabase.storage
        .from(SUPABASE_IMAGE_BUCKET)
        .remove(keys);

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

export function getStorageClient(env: AppBindings): StorageClient {
  if (env.IMAGES_BUCKET) {
    return createR2StorageClient(env.IMAGES_BUCKET);
  }

  runtimeStorageClient ??= createSupabaseStorageClient();
  return runtimeStorageClient;
}

export async function putImageObject(
  env: AppBindings,
  key: string,
  value: Blob,
  contentType: string,
): Promise<void> {
  await getStorageClient(env).put(key, value, contentType);
}

export async function getImageObject(
  env: AppBindings,
  key: string,
): Promise<StorageObject | null> {
  return getStorageClient(env).get(key);
}

export async function deleteImageObjects(
  env: AppBindings,
  keys: string[],
): Promise<void> {
  await getStorageClient(env).remove(keys);
}
