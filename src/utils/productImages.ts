// Decides which pictures a product has after an edit.
//
// The admin editor uploads pictures itself and sends the finished list as `primaryImage` +
// `otherImages`. An older form sent `imagesToKeep` (+ files uploaded by this server, `newImages`).
// Both are understood here. When an edit says nothing about pictures, nothing changes and nothing
// is removed from storage.

const PLACEHOLDER = '/placeholder.png';

type CurrentImages = { primaryImage?: string | null; otherImages?: string[] | null };
type ImageEdit = {
  primaryImage?: string;
  otherImages?: string[];
  imagesToKeep?: string[];
  newImages?: string[];
};

const isRealImage = (url: unknown): url is string =>
  typeof url === 'string' && url.trim() !== '' && url.trim() !== PLACEHOLDER;

const uniqueReal = (urls: unknown[]): string[] => {
  const out: string[] = [];
  for (const url of urls) {
    if (!isRealImage(url)) continue;
    const clean = url.trim();
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
};

export function resolveProductImages(current: CurrentImages, edit: ImageEdit) {
  const currentOthers = Array.isArray(current.otherImages) ? current.otherImages : [];
  const unchanged = {
    primaryImage: current.primaryImage || '',
    otherImages: currentOthers,
    removed: [] as string[],
  };

  const sentPrimary = isRealImage(edit.primaryImage);
  const sentOthers = Array.isArray(edit.otherImages);

  let finalList: string[];
  if (sentPrimary || sentOthers) {
    finalList = uniqueReal([
      sentPrimary ? edit.primaryImage : current.primaryImage,
      ...(sentOthers ? (edit.otherImages as string[]) : currentOthers),
    ]);
  } else {
    finalList = uniqueReal([...(edit.imagesToKeep || []), ...(edit.newImages || [])]);
  }

  // No picture named at all: keep what the product has (a product is never left without its
  // pictures by an edit that did not mention them).
  if (finalList.length === 0) return unchanged;

  const removed = uniqueReal([current.primaryImage, ...currentOthers]).filter(
    (url) => !finalList.includes(url),
  );

  return { primaryImage: finalList[0], otherImages: finalList.slice(1), removed };
}
