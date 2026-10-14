import { describe, expect, it } from 'vitest';
import { validateScan } from './validate';

const MAX = 1_000;
const id = 'k3x9-abcdef12';

describe('validateScan', () => {
  it('accepts an install id and a base64 image', () => {
    expect(validateScan(id, { image: 'aGVsbG8=' }, MAX)).toEqual({
      ok: true,
      request: { installId: id, image: 'aGVsbG8=' },
    });
  });

  it('needs a sensible install id', () => {
    expect(validateScan(null, { image: 'aGVsbG8=' }, MAX)).toMatchObject({ status: 400, error: 'missing_install_id' });
    expect(validateScan('short', { image: 'aGVsbG8=' }, MAX)).toMatchObject({ error: 'missing_install_id' });
    expect(validateScan('has spaces in it', { image: 'aGVsbG8=' }, MAX)).toMatchObject({
      error: 'missing_install_id',
    });
  });

  it('needs an image', () => {
    expect(validateScan(id, {}, MAX)).toMatchObject({ status: 400, error: 'missing_image' });
    expect(validateScan(id, null, MAX)).toMatchObject({ error: 'missing_image' });
    expect(validateScan(id, { image: 42 }, MAX)).toMatchObject({ error: 'missing_image' });
  });

  it('turns away a huge upload before spending anything on it', () => {
    expect(validateScan(id, { image: 'A'.repeat(2_000) }, MAX)).toMatchObject({
      status: 413,
      error: 'image_too_large',
    });
  });

  it('rejects anything that is not plain base64', () => {
    expect(validateScan(id, { image: 'data:image/jpeg;base64,aGVsbG8=' }, MAX)).toMatchObject({
      error: 'bad_image',
    });
    expect(validateScan(id, { image: 'not base64!' }, MAX)).toMatchObject({ error: 'bad_image' });
  });
});
