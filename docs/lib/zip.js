// Minimal, dependency-free ZIP writer (store method -- no compression, since
// PNGs are already compressed). Works in both the browser and Node, since it
// only touches Uint8Array/DataView -- no Blob, no `window`.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16(value) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, value, true);
  return b;
}

function u32(value) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value, true);
  return b;
}

/**
 * Build a ZIP archive from `entries` ([{name: string, data: Uint8Array}]).
 * Returns a single Uint8Array containing the full archive.
 */
export function buildZip(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const centralRecords = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const localHeaderOffset = offset;

    const localHeader = [
      u32(0x04034b50),
      u16(20), // version needed
      u16(0),  // flags
      u16(0),  // compression: store
      u16(0),  // mod time
      u16(0),  // mod date
      u32(crc),
      u32(data.length), // compressed size == uncompressed size (store)
      u32(data.length), // uncompressed size
      u16(nameBytes.length),
      u16(0), // extra field length
    ];
    for (const part of localHeader) { chunks.push(part); offset += part.length; }
    chunks.push(nameBytes); offset += nameBytes.length;
    chunks.push(data); offset += data.length;

    centralRecords.push({ nameBytes, crc, size: data.length, localHeaderOffset });
  }

  const centralDirStart = offset;
  for (const rec of centralRecords) {
    const central = [
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0),  // flags
      u16(0),  // compression: store
      u16(0),  // mod time
      u16(0),  // mod date
      u32(rec.crc),
      u32(rec.size),
      u32(rec.size),
      u16(rec.nameBytes.length),
      u16(0), // extra field length
      u16(0), // comment length
      u16(0), // disk number start
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(rec.localHeaderOffset),
    ];
    for (const part of central) { chunks.push(part); offset += part.length; }
    chunks.push(rec.nameBytes); offset += rec.nameBytes.length;
  }
  const centralDirSize = offset - centralDirStart;

  const eocd = [
    u32(0x06054b50),
    u16(0), // disk number
    u16(0), // disk with central dir
    u16(centralRecords.length),
    u16(centralRecords.length),
    u32(centralDirSize),
    u32(centralDirStart),
    u16(0), // comment length
  ];
  for (const part of eocd) { chunks.push(part); offset += part.length; }

  const result = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}
