/**
 * Extract JS/TS source files from an npm tarball (.tgz) in a Worker.
 *
 * Uses DecompressionStream (available in Workers) for gzip,
 * and a minimal tar parser for the POSIX ustar format.
 */

export interface ExtractedFile {
  path: string;
  content: string;
  size: number;
}

const SOURCE_EXTENSIONS = /\.(js|mjs|cjs|ts|mts|cts|jsx|tsx|sh|json)$/;
const MAX_FILE_SIZE = 512_000; // 512KB per file
const MAX_TOTAL_SIZE = 2_000_000; // 2MB total extracted text

export async function extractSourceFiles(
  tarballUrl: string,
): Promise<ExtractedFile[]> {
  const res = await fetch(tarballUrl);
  if (!res.ok || !res.body) return [];

  const decompressed = res.body.pipeThrough(new DecompressionStream("gzip"));
  const reader = decompressed.getReader();

  const files: ExtractedFile[] = [];
  let totalSize = 0;
  let buffer = new Uint8Array(0);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        const next = new Uint8Array(buffer.length + value.length);
        next.set(buffer);
        next.set(value, buffer.length);
        buffer = next;
      }

      while (buffer.length >= 512) {
        const header = buffer.slice(0, 512);

        if (isZeroBlock(header)) {
          buffer = buffer.slice(512);
          continue;
        }

        const name = readString(header, 0, 100);
        const sizeStr = readString(header, 124, 12);
        const prefix = readString(header, 345, 155);
        const fileSize = parseInt(sizeStr, 8) || 0;
        const paddedSize = Math.ceil(fileSize / 512) * 512;
        const fullPath = prefix ? `${prefix}/${name}` : name;

        // Strip the leading "package/" that npm tarballs always have
        const cleanPath = fullPath.replace(/^package\//, "");

        const totalBlocks = 512 + paddedSize;
        if (buffer.length < totalBlocks) break; // need more data

        const typeFlag = header[156];
        const isFile = typeFlag === 0 || typeFlag === 48; // '0' or NUL

        if (isFile && SOURCE_EXTENSIONS.test(cleanPath) && fileSize <= MAX_FILE_SIZE) {
          const content = new TextDecoder().decode(
            buffer.slice(512, 512 + fileSize),
          );
          if (totalSize + content.length <= MAX_TOTAL_SIZE) {
            files.push({ path: cleanPath, content, size: fileSize });
            totalSize += content.length;
          }
        }

        buffer = buffer.slice(totalBlocks);
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  return files;
}

function readString(buf: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.slice(offset, end));
}

function isZeroBlock(block: Uint8Array): boolean {
  for (let i = 0; i < 512; i++) {
    if (block[i] !== 0) return false;
  }
  return true;
}
