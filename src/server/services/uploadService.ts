import {
  buildImageObjectKey,
  deleteImageObjects,
  getImageObject,
  putImageObject,
  type StorageObject,
} from "../lib/storage.js";
import { toDbClient, type DatabaseLike } from "../lib/db.js";
import {
  createImage,
  deleteImageById,
  getImageById,
  getNextSortOrder,
  listAllImages,
  listActiveImages,
  updateImageAsset,
} from "../repositories/imagesRepo.js";
import {
  deletePersonalImageStateByImageId,
  deleteSharedImageStateByImageId,
} from "../repositories/leaderboardsRepo.js";
import { findMatchingImageIds } from "../../lib/imageMatching.js";
import type { AppBindings } from "../types.js";

interface UploadImageInput {
  display: File;
  height: number;
  original?: File;
  replaceImageId?: string;
  sourceName?: string;
  uploadedBy: string;
  width: number;
}

function imageNameFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const extensionIndex = trimmed.lastIndexOf(".");
  const stem =
    extensionIndex > 0 ? trimmed.slice(0, extensionIndex) : trimmed;
  const normalized = stem.replace(/\s+/g, " ").trim();
  return normalized || crypto.randomUUID();
}

async function getAvailableImageId(
  db: DatabaseLike,
  baseName: string,
): Promise<string> {
  let imageId = baseName;
  let suffix = 2;

  while (await getImageById(db, imageId)) {
    imageId = `${baseName} ${suffix}`;
    suffix += 1;
  }

  return imageId;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function ensureImageFile(file: File | undefined, label: string): void {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`${label} file is required`);
  }

  if (!file.type.startsWith("image/")) {
    throw new Error(`${label} file must be an image`);
  }
}

function fallbackSourceName(displayName: string): string {
  return displayName.replace(/-display(?=\.[^.]+$|$)/, "");
}

export async function searchImagesById(
  db: DatabaseLike,
  query: string,
): Promise<Array<{ id: string }>> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const images = await listAllImages(db);
  return images
    .filter((image) => image.id.toLowerCase().includes(normalizedQuery))
    .slice(0, 25)
    .map((image) => ({ id: image.id }));
}

export async function uploadImage(
  db: DatabaseLike,
  env: AppBindings,
  input: UploadImageInput,
): Promise<{ image: { id: string }; replaced: boolean }> {
  const dbClient = toDbClient(db);

  ensureImageFile(input.display, "Display");
  if (input.original) {
    ensureImageFile(input.original, "Original");
  }

  if (!isPositiveInteger(input.width) || !isPositiveInteger(input.height)) {
    throw new Error("Width and height must be positive integers");
  }

  const originalFile = input.original ?? input.display;
  const sourceName =
    input.sourceName?.trim() ||
    input.original?.name ||
    fallbackSourceName(input.display.name);
  let replaceImageId = input.replaceImageId?.trim() || null;

  if (!replaceImageId) {
    const matchingImageIds = findMatchingImageIds(
      sourceName,
      (await listActiveImages(db)).map((image) => image.id),
    );

    if (matchingImageIds.length > 1) {
      throw new Error("Filename matches multiple existing image ids");
    }

    replaceImageId = matchingImageIds[0] ?? null;
  }

  const imageId = replaceImageId
    ? replaceImageId
    : await getAvailableImageId(db, imageNameFromFileName(sourceName));
  const storageObjectId = crypto.randomUUID();
  const originalKey = buildImageObjectKey(storageObjectId, "original");
  const displayKey = buildImageObjectKey(storageObjectId, "display");
  const createdAt = new Date().toISOString();
  let oldKeysToDelete: string[] = [];

  try {
    await putImageObject(
      env,
      originalKey,
      originalFile,
      originalFile.type || input.display.type || "application/octet-stream",
    );
    await putImageObject(
      env,
      displayKey,
      input.display,
      input.display.type || originalFile.type || "application/octet-stream",
    );

    if (replaceImageId) {
      await dbClient.transaction(async (tx) => {
        const existingImage = await getImageById(tx, replaceImageId);
        if (!existingImage) {
          throw new Error(`Image ${replaceImageId} does not exist`);
        }

        oldKeysToDelete = [
          existingImage.r2_key_original,
          existingImage.r2_key_display,
        ];

        await updateImageAsset(tx, {
          id: replaceImageId,
          r2_key_original: originalKey,
          r2_key_display: displayKey,
          width: input.width,
          height: input.height,
          mime_type:
            input.display.type ||
            originalFile.type ||
            "application/octet-stream",
          uploaded_by: input.uploadedBy,
        });
      });
    } else {
      await createImage(db, {
        id: imageId,
        r2_key_original: originalKey,
        r2_key_display: displayKey,
        width: input.width,
        height: input.height,
        mime_type:
          input.display.type || originalFile.type || "application/octet-stream",
        sort_order: await getNextSortOrder(db),
        status: "active",
        uploaded_by: input.uploadedBy,
        created_at: createdAt,
      });
    }
  } catch (error) {
    await deleteImageObjects(env, [originalKey, displayKey]);
    throw error;
  }

  if (oldKeysToDelete.length > 0) {
    await deleteImageObjects(env, oldKeysToDelete).catch(() => undefined);
  }

  return {
    image: { id: imageId },
    replaced: Boolean(replaceImageId),
  };
}

export async function getDisplayImage(
  db: DatabaseLike,
  env: AppBindings,
  imageId: string,
): Promise<{
  image: Awaited<ReturnType<typeof getImageById>>;
  object: StorageObject;
} | null> {
  const image = await getImageById(db, imageId);
  if (!image) {
    return null;
  }

  const object = await getImageObject(env, image.r2_key_display);
  if (!object) {
    return null;
  }

  return {
    image,
    object,
  };
}

export async function deleteImage(
  db: DatabaseLike,
  env: AppBindings,
  imageId: string,
): Promise<void> {
  const normalizedImageId = imageId.trim();
  if (!normalizedImageId) {
    throw new Error("Image id is required");
  }

  const image = await getImageById(db, normalizedImageId);
  if (!image) {
    throw new Error(`Image ${normalizedImageId} does not exist`);
  }

  await deleteImageObjects(env, [image.r2_key_original, image.r2_key_display]);

  await toDbClient(db).transaction(async (tx) => {
    await deletePersonalImageStateByImageId(tx, normalizedImageId);
    await deleteSharedImageStateByImageId(tx, normalizedImageId);
    await deleteImageById(tx, normalizedImageId);
  });
}
