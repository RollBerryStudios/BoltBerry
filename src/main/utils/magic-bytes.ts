import { openSync, readSync, closeSync } from 'fs'

/**
 * Verify the first bytes of a file match the expected extension's magic
 * number. Used to catch corrupted or disguised files (e.g. a .exe renamed
 * to .png) on any ingest path — individual uploads (IMPORT_FILE) and
 * campaign ZIP imports both route through this so the rules stay aligned.
 *
 * Unknown extensions default to reject under strict mode (campaign import)
 * and accept under lenient mode (individual uploads, where the picker's
 * extension filter already constrains the set).
 */
export function validateMagicBytes(filePath: string, ext: string, strict = false): boolean {
  const fd = openSync(filePath, 'r')
  const buf = Buffer.alloc(16)
  try {
    readSync(fd, buf, 0, 16, 0)
  } finally {
    closeSync(fd)
  }
  switch (ext.toLowerCase()) {
    case '.png':  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    case '.jpg':
    case '.jpeg': return buf[0] === 0xff && buf[1] === 0xd8
    case '.webp': return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    case '.gif':  return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46
    case '.mp3':  return (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) || (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)
    case '.wav':  return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
    case '.ogg':  return buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53
    case '.m4a':  return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
    default:      return !strict
  }
}
