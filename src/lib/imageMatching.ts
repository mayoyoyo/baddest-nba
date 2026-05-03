const MIN_TYPO_TOLERANCE_CHARS = 8;

export function normalizeImageMatchKey(value: string): string {
  const trimmed = value.trim();
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "");
  const withoutCopySuffix = withoutExtension
    .replace(/[-_\s]*\(\d+\)\s*$/, "")
    .replace(/[-_\s]+\d+\s*$/, "");

  return withoutCopySuffix
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/[_-\s]+/g, " ")
    .trim();
}

function meaningfulLength(value: string): number {
  return value.replace(/\s+/g, "").length;
}

function isSingleEditAway(left: string, right: string): boolean {
  if (left === right) {
    return false;
  }

  const lengthDelta = Math.abs(left.length - right.length);
  if (lengthDelta > 1) {
    return false;
  }

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) {
      return false;
    }

    if (left.length > right.length) {
      leftIndex += 1;
      continue;
    }

    if (right.length > left.length) {
      rightIndex += 1;
      continue;
    }

    leftIndex += 1;
    rightIndex += 1;
  }

  if (leftIndex < left.length || rightIndex < right.length) {
    edits += 1;
  }

  return edits === 1;
}

export function findMatchingImageIds(
  sourceName: string,
  imageIds: string[],
): string[] {
  const targetKey = normalizeImageMatchKey(sourceName);
  const exactMatches = imageIds.filter(
    (imageId) => normalizeImageMatchKey(imageId) === targetKey,
  );

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  if (meaningfulLength(targetKey) < MIN_TYPO_TOLERANCE_CHARS) {
    return [];
  }

  return imageIds.filter((imageId) => {
    const candidateKey = normalizeImageMatchKey(imageId);
    if (meaningfulLength(candidateKey) < MIN_TYPO_TOLERANCE_CHARS) {
      return false;
    }

    return isSingleEditAway(targetKey, candidateKey);
  });
}
