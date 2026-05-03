export function buildImageUrl(imageId: string): string {
  const params = new URLSearchParams({ imageId });
  return `/api/image?${params.toString()}`;
}

export function buildLegacyImageUrl(imageId: string): string {
  return `/api/images/${encodeURIComponent(imageId)}`;
}
