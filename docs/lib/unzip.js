// Minimal ZIP reader: finds one entry by (suffix-matched) name and returns
// its decompressed bytes. Only what's needed to pull a single file out of a
// real-world ZIP (store or deflate) -- not a general-purpose unzip.

function readU16(view, offset) { return view.getUint16(offset, true); }
function readU32(view, offset) { return view.getUint32(offset, true); }

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(bytes) {
  // The EOCD record is at least 22 bytes, and may be preceded by a comment
  // up to 65535 bytes -- scan backwards from the end for its signature.
  const maxCommentSize = 65535;
  const minOffset = Math.max(0, bytes.length - 22 - maxCommentSize);
  for (let offset = bytes.length - 22; offset >= minOffset; offset--) {
    if (readU32(new DataView(bytes.buffer, bytes.byteOffset + offset, 4), 0) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('Not a valid ZIP file (no end-of-central-directory record found).');
}

function listEntries(bytes) {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const eocdView = new DataView(bytes.buffer, bytes.byteOffset + eocdOffset, 22);
  const totalEntries = readU16(eocdView, 10);
  let offset = readU32(eocdView, 16); // central directory start offset

  const entries = [];
  const decoder = new TextDecoder('utf-8');
  for (let i = 0; i < totalEntries; i++) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 46);
    if (readU32(view, 0) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Malformed ZIP central directory at offset ${offset}.`);
    }
    const compressionMethod = readU16(view, 10);
    const compressedSize = readU32(view, 20);
    const uncompressedSize = readU32(view, 24);
    const nameLength = readU16(view, 28);
    const extraLength = readU16(view, 30);
    const commentLength = readU16(view, 32);
    const localHeaderOffset = readU32(view, 42);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = decoder.decode(nameBytes);
    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(compressedBytes) {
  const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntryData(bytes, entry) {
  const localView = new DataView(
    bytes.buffer, bytes.byteOffset + entry.localHeaderOffset, 30,
  );
  if (readU32(localView, 0) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`Malformed ZIP local header for "${entry.name}".`);
  }
  const nameLength = readU16(localView, 26);
  const extraLength = readU16(localView, 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const compressedBytes = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressedBytes;
  if (entry.compressionMethod === 8) return inflateRaw(compressedBytes);
  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for "${entry.name}".`);
}

/** Find the first entry whose name ends with `nameSuffix` and return its
 * decompressed bytes. Throws if no such entry exists. */
export async function extractZipEntry(arrayBuffer, nameSuffix) {
  const bytes = new Uint8Array(arrayBuffer);
  const entries = listEntries(bytes);
  const entry = entries.find((e) => e.name.endsWith(nameSuffix));
  if (!entry) {
    throw new Error(`No entry ending in "${nameSuffix}" found in ZIP (entries: ${entries.map((e) => e.name).join(', ')}).`);
  }
  return readEntryData(bytes, entry);
}
