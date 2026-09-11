const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Windows PowerShell 5.1 interprets BOM-less script files using the active
 * legacy code page. Preserve UTF-8 source bytes and add the BOM exactly once.
 */
export function ensureUtf8Bom(input: Buffer): Buffer {
  if (input.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) return input;
  return Buffer.concat([UTF8_BOM, input]);
}

/** Normalize text payloads for Windows command processors without changing content. */
export function ensureCrLf(input: Buffer): Buffer {
  const normalized = input.toString('utf8').replace(/\r\n|\r|\n/g, '\n').replace(/\n/g, '\r\n');
  return Buffer.from(normalized, 'utf8');
}
