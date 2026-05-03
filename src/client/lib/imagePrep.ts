import { buildImageUrl, buildLegacyImageUrl } from "./imageUrls";

export interface PreparedUploadImage {
  displayFile: File;
  height: number;
  previewUrl: string;
  width: number;
}

interface PairLike {
  left: { id: string };
  right: { id: string };
}

const preloadedImagePromises = new Map<string, Promise<void>>();

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = src;
  });

  return image;
}

function imageUrls(imageId: string): string[] {
  return [buildImageUrl(imageId), buildLegacyImageUrl(imageId)];
}

export async function preloadPairImages(pair: PairLike | null): Promise<void> {
  if (!pair) {
    return;
  }

  await Promise.all([
    preloadImageIds([pair.left.id]),
    preloadImageIds([pair.right.id]),
  ]);
}

export async function preloadImageIds(imageIds: string[]): Promise<void> {
  const uniqueImageIds = [...new Set(imageIds.filter(Boolean))];

  await Promise.all(
    uniqueImageIds.map((imageId) => {
      for (const url of imageUrls(imageId)) {
        const existing = preloadedImagePromises.get(url);
        if (existing) {
          return existing;
        }
      }

      const primaryUrl = imageUrls(imageId)[0];
      const promise = (async () => {
        let lastError: unknown = null;

        for (const url of imageUrls(imageId)) {
          try {
            await loadImage(url);
            return;
          } catch (error) {
            preloadedImagePromises.delete(url);
            lastError = error;
          }
        }

        throw lastError instanceof Error ? lastError : new Error("Unable to load image");
      })()
        .then(() => undefined)
        .catch((error) => {
          preloadedImagePromises.delete(primaryUrl);
          throw error;
        });
      preloadedImagePromises.set(primaryUrl, promise);
      return promise;
    }),
  );
}

export async function prepareImageForUpload(
  file: File,
  maxEdge = 1200,
): Promise<PreparedUploadImage> {
  const previewUrl = URL.createObjectURL(file);
  const image = await loadImage(previewUrl);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable");
  }

  context.drawImage(image, 0, 0, width, height);

  const displayBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to create display image"));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.88,
    );
  });

  const displayFile = new File(
    [displayBlob],
    `${file.name.replace(/\.[^.]+$/, "")}-display.jpg`,
    {
      type: "image/jpeg",
    },
  );
  return {
    displayFile,
    height,
    previewUrl,
    width,
  };
}
