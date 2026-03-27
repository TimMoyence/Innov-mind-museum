import {
  resolveLocalImageFilePath,
  DEFAULT_LOCAL_UPLOADS_DIR,
} from '@modules/chat/adapters/secondary/image-storage.stub';
import path from 'path';

describe('resolveLocalImageFilePath', () => {
  it('resolves a valid local:// reference to a file path', () => {
    const result = resolveLocalImageFilePath('local://abc123.jpg');
    expect(result).toBe(path.join(DEFAULT_LOCAL_UPLOADS_DIR, 'abc123.jpg'));
  });

  it('resolves with a custom uploads directory', () => {
    const result = resolveLocalImageFilePath('local://photo.png', '/custom/dir');
    expect(result).toBe(path.join('/custom/dir', 'photo.png'));
  });

  it('returns null for non-local:// references', () => {
    expect(resolveLocalImageFilePath('s3://bucket/key.jpg')).toBeNull();
    expect(resolveLocalImageFilePath('https://example.com/img.jpg')).toBeNull();
    expect(resolveLocalImageFilePath('random-string')).toBeNull();
  });

  it('returns null for local:// with path traversal', () => {
    expect(resolveLocalImageFilePath('local://../etc/passwd')).toBeNull();
    expect(resolveLocalImageFilePath('local://sub/dir/file.jpg')).toBeNull();
  });

  it('returns null for empty local:// reference', () => {
    expect(resolveLocalImageFilePath('local://')).toBeNull();
  });

  it('accepts filenames with dots, hyphens, and underscores', () => {
    const result = resolveLocalImageFilePath('local://my-file_name.test.webp');
    expect(result).toBe(path.join(DEFAULT_LOCAL_UPLOADS_DIR, 'my-file_name.test.webp'));
  });
});
