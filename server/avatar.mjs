export function parseAvatar(value) {
  if (typeof value !== 'string' || value.length > 65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  let bytes;
  try { bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
  catch { return null; }
  if (bytes.length < 28 || bytes.length > 49152) return null;
  const view = new DataView(bytes.buffer);
  const magic = (offset, text) => [...text].every((c, i) => c.charCodeAt(0) === bytes[offset + i]);
  if (!magic(0, 'RIFF') || !magic(8, 'WEBP') || view.getUint32(4, true) + 8 !== bytes.length) return null;
  const size = view.getUint32(16, true);
  if (20 + size + (size % 2) !== bytes.length) return null;
  let width;
  let height;
  if (magic(12, 'VP8 ') && size >= 12 && !(bytes[20] & 1) &&
      bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
    width = view.getUint16(26, true) & 16383;
    height = view.getUint16(28, true) & 16383;
  } else if (magic(12, 'VP8L') && size >= 6 && bytes[20] === 47) {
    const dimensions = view.getUint32(21, true);
    if (dimensions >>> 29) return null;
    width = (dimensions & 16383) + 1;
    height = ((dimensions >>> 14) & 16383) + 1;
  } else return null;
  return width > 0 && height > 0 && width <= 256 && height <= 256 ? bytes : null;
}
