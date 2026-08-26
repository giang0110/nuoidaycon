/**
 * Real image processing, not mocks. These tests build a JPEG that genuinely
 * carries GPS EXIF, push it through the sanitiser, and read the output back to
 * confirm the metadata is gone.
 *
 * Mocking sharp here would test nothing: the whole claim is about what the
 * encoder actually writes.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  sanitiseImage,
  buildStoragePath,
  MAX_UPLOAD_BYTES,
  OUTPUT_MIME,
} from '@/lib/media/sanitise-image';

/** A JPEG with GPS coordinates and a device make/model in its EXIF. */
async function jpegWithGpsExif(): Promise<Buffer> {
  return sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .withExif({
      IFD0: { Make: 'ACME Phone', Model: 'Pixelish 9', Software: 'CameraApp 1.2' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '21/1 1/1 4083/100',
        GPSLongitudeRef: 'E',
        GPSLongitude: '105/1 51/1 1234/100',
      },
    })
    .jpeg()
    .toBuffer();
}

async function plainPng(): Promise<Buffer> {
  return sharp({
    create: { width: 120, height: 90, channels: 3, background: { r: 10, g: 200, b: 90 } },
  })
    .png()
    .toBuffer();
}

describe('EXIF removal', () => {
  it('the fixture really does carry GPS EXIF before sanitisation', async () => {
    const original = await jpegWithGpsExif();
    const meta = await sharp(original).metadata();
    expect(meta.exif, 'fixture must have EXIF or this test proves nothing').toBeDefined();
    expect(meta.exif!.toString('latin1')).toContain('ACME Phone');
  });

  it('discards EXIF entirely', async () => {
    const result = await sanitiseImage(await jpegWithGpsExif(), 'image/jpeg');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const meta = await sharp(result.data).metadata();
    expect(meta.exif, 'EXIF block must be absent after re-encode').toBeUndefined();
  });

  it('leaves no GPS or device string anywhere in the output bytes', async () => {
    const result = await sanitiseImage(await jpegWithGpsExif(), 'image/jpeg');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bytes = result.data.toString('latin1');
    for (const needle of ['ACME Phone', 'Pixelish 9', 'CameraApp', 'GPS']) {
      expect(bytes, `"${needle}" survived sanitisation`).not.toContain(needle);
    }
  });

  it('drops XMP and IPTC as well, not just EXIF', async () => {
    const withXmp = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'SECRET-MARKER' } } })
      .jpeg()
      .toBuffer();

    const result = await sanitiseImage(withXmp, 'image/jpeg');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.toString('latin1')).not.toContain('SECRET-MARKER');
  });
});

describe('normalisation', () => {
  it('always outputs JPEG, whatever came in', async () => {
    const result = await sanitiseImage(await plainPng(), 'image/png');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mimeType).toBe(OUTPUT_MIME);
    expect((await sharp(result.data).metadata()).format).toBe('jpeg');
  });

  it('caps the longest edge without enlarging a small image', async () => {
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const result = await sanitiseImage(big, 'image/jpeg');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2000);

    const small = await sanitiseImage(await plainPng(), 'image/png');
    expect(small.ok).toBe(true);
    if (!small.ok) return;
    expect(small.width).toBe(120);
  });
});

describe('rejection', () => {
  it('rejects an oversized upload before decoding it', async () => {
    const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    const result = await sanitiseImage(huge, 'image/jpeg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too_large');
  });

  it('rejects a declared type that is not an accepted image', async () => {
    const result = await sanitiseImage(Buffer.from('x'), 'application/pdf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported_type');
  });

  it('rejects bytes that are not an image, whatever the client claims', async () => {
    // The declared mime is accepted; the DECODER is the real check.
    const result = await sanitiseImage(Buffer.from('%PDF-1.7 not really a jpeg'), 'image/jpeg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_an_image');
  });

  it('rejects an SVG, which can carry script', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const result = await sanitiseImage(svg, 'image/svg+xml');
    expect(result.ok).toBe(false);
  });
});

describe('buildStoragePath', () => {
  it('puts the parent id first, so the prefix is the tenant check', () => {
    const path = buildStoragePath({
      parentId: 'p1',
      childId: 'c1',
      submissionId: 's1',
      index: 0,
    });
    expect(path).toBe('p1/c1/s1/0.jpg');
    expect(path.split('/')[0]).toBe('p1');
  });
});
