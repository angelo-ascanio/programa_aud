export interface ZipInputFile {
  name: string;
  data: Uint8Array;
  modifiedAt?: Date;
}

export interface ZipArchiveOptions {
  /**
   * Optional raw-deflate compressor (e.g., zlib.deflateRawSync on Node).
   * When omitted, entries are stored uncompressed (method 0), which is 100% RFC-compatible.
   */
  compress?: (data: Uint8Array) => Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * Pure, dependency-free ZIP archive builder (PKZIP 2.0 compatible, UTF-8 filenames).
 */
export function buildZipArchive(
  files: ReadonlyArray<ZipInputFile>,
  options: ZipArchiveOptions = {}
): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const file of files) {
    const safeName = file.name.replace(/^\/+/, '').replace(/\\/g, '/');
    const nameBytes = encoder.encode(safeName);
    const rawData = file.data;
    const crc = computeCrc32(rawData);
    const { dosTime, dosDate } = encodeDosDateTime(file.modifiedAt ?? new Date());

    let method = 0;
    let payload = rawData;
    if (options.compress && rawData.length > 0) {
      const compressed = options.compress(rawData);
      if (compressed.length < rawData.length) {
        method = 8;
        payload = compressed;
      }
    }

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32LE(localView, 0, 0x04034b50); // Local file header signature
    writeUint16LE(localView, 4, 20); // Version needed to extract (2.0)
    writeUint16LE(localView, 6, 0x0800); // General purpose bit flag: UTF-8 filename
    writeUint16LE(localView, 8, method);
    writeUint16LE(localView, 10, dosTime);
    writeUint16LE(localView, 12, dosDate);
    writeUint32LE(localView, 14, crc);
    writeUint32LE(localView, 18, payload.length);
    writeUint32LE(localView, 22, rawData.length);
    writeUint16LE(localView, 26, nameBytes.length);
    writeUint16LE(localView, 28, 0); // Extra field length
    localHeader.set(nameBytes, 30);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32LE(centralView, 0, 0x02014b50); // Central file header signature
    writeUint16LE(centralView, 4, 20); // Version made by
    writeUint16LE(centralView, 6, 20); // Version needed
    writeUint16LE(centralView, 8, 0x0800); // UTF-8 filename flag
    writeUint16LE(centralView, 10, method);
    writeUint16LE(centralView, 12, dosTime);
    writeUint16LE(centralView, 14, dosDate);
    writeUint32LE(centralView, 16, crc);
    writeUint32LE(centralView, 20, payload.length);
    writeUint32LE(centralView, 24, rawData.length);
    writeUint16LE(centralView, 28, nameBytes.length);
    writeUint16LE(centralView, 30, 0); // Extra field length
    writeUint16LE(centralView, 32, 0); // File comment length
    writeUint16LE(centralView, 34, 0); // Disk number start
    writeUint16LE(centralView, 36, 0); // Internal file attributes
    writeUint32LE(centralView, 38, 0); // External file attributes
    writeUint32LE(centralView, 42, offset); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, payload);
    centralParts.push(centralHeader);
    offset += localHeader.length + payload.length;
    centralSize += centralHeader.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeUint32LE(eocdView, 0, 0x06054b50);
  writeUint16LE(eocdView, 4, 0); // Number of this disk
  writeUint16LE(eocdView, 6, 0); // Disk where central directory starts
  writeUint16LE(eocdView, 8, files.length);
  writeUint16LE(eocdView, 10, files.length);
  writeUint32LE(eocdView, 12, centralSize);
  writeUint32LE(eocdView, 16, offset);
  writeUint16LE(eocdView, 20, 0); // Comment length

  const totalLength = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);
  return output;
}
