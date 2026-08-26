import sharp from 'sharp';

/**
 * Server-side image sanitisation — CHILD_SAFETY.md §7, decision A10.
 *
 * Photos of a child's handwriting and drawing are the most sensitive thing this
 * product stores. Camera EXIF routinely carries GPS coordinates, the device
 * serial, and a precise timestamp. None of that may reach storage.
 *
 * The upload is therefore DECODED AND RE-ENCODED here, on the server. That
 * discards EXIF, XMP, IPTC and ICC wholesale rather than trying to delete known
 * tags — a strip-list is only as good as its list, whereas a re-encode cannot
 * carry metadata forward by construction.
 *
 * Client-side stripping is a bandwidth optimisation and is NEVER relied on:
 * the client is not trusted, and a modified client can send whatever it likes.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_DIMENSION = 2000;
export const OUTPUT_MIME = 'image/jpeg' as const;
export const OUTPUT_QUALITY = 82;

export const ACCEPTED_INPUT_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedInputMime = (typeof ACCEPTED_INPUT_MIME)[number];

export type SanitiseFailure =
  | { ok: false; reason: 'too_large'; detail: string }
  | { ok: false; reason: 'unsupported_type'; detail: string }
  | { ok: false; reason: 'not_an_image'; detail: string };

export type SanitiseResult =
  | {
      ok: true;
      data: Buffer;
      mimeType: typeof OUTPUT_MIME;
      width: number;
      height: number;
      bytes: number;
    }
  | SanitiseFailure;

/**
 * Validate, decode, re-encode. Returns a clean JPEG with no metadata blocks.
 *
 * Note that the DECLARED mime type is checked only as a fast rejection; the
 * authoritative check is whether sharp can actually decode the bytes. A
 * client claiming "image/jpeg" for a PDF gets rejected by the decoder, not by
 * its own header.
 */
export async function sanitiseImage(input: Buffer, declaredMime: string): Promise<SanitiseResult> {
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      detail: `${input.byteLength} bytes exceeds ${MAX_UPLOAD_BYTES}`,
    };
  }

  if (!(ACCEPTED_INPUT_MIME as readonly string[]).includes(declaredMime)) {
    return { ok: false, reason: 'unsupported_type', detail: declaredMime };
  }

  try {
    const pipeline = sharp(input, { failOn: 'error' });
    const metadata = await pipeline.metadata();

    if (!metadata.format || !metadata.width || !metadata.height) {
      return { ok: false, reason: 'not_an_image', detail: 'no decodable image data' };
    }

    const data = await pipeline
      // rotate() with no argument applies the EXIF orientation, then the
      // re-encode drops the tag — so the image looks right without carrying
      // the metadata that told us so.
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      // Explicitly do NOT call withMetadata(): that would re-attach it.
      .jpeg({ quality: OUTPUT_QUALITY, mozjpeg: true })
      .toBuffer();

    const out = await sharp(data).metadata();

    return {
      ok: true,
      data,
      mimeType: OUTPUT_MIME,
      width: out.width ?? 0,
      height: out.height ?? 0,
      bytes: data.byteLength,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'not_an_image',
      detail: error instanceof Error ? error.message : 'decode failed',
    };
  }
}

/** `{parentId}/{childId}/{submissionId}/{filename}` — the prefix IS the tenant check. */
export function buildStoragePath(input: {
  parentId: string;
  childId: string;
  submissionId: string;
  index: number;
}): string {
  return `${input.parentId}/${input.childId}/${input.submissionId}/${input.index}.jpg`;
}
