/**
 * Create a deterministic SHA-1 hash for a language + code pair.
 * The function automatically selects the proper crypto implementation for both Node.js and browser contexts.
 */
export async function createExecId(lang: string, code: string): Promise<string> {
  const encoder = new TextEncoder();
  const payload = encoder.encode(`${lang}:${code}`);

  const runtimeCrypto = getRuntimeCrypto();
  const digest = await runtimeCrypto.subtle.digest('SHA-1', payload);
  return bufferToHex(new Uint8Array(digest));
}

/** Convert a byte array into a hexadecimal string. */
function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getRuntimeCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }

  throw new Error('WebCrypto API is not available in this environment.');
}
