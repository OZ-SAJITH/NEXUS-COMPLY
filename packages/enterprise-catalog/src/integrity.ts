// ---------------------------------------------------------------------------
// Integrity primitives — PHASE 2.
//
// Evidence integrity must be actually computed, never faked. This module
// provides a standards-compliant SHA-256 (FIPS 180-4) implementing only the
// message schedule + compression loop over captured input bytes. It is pure
// TypeScript so the same hash is computed identically in the Node API process,
// in the vitest suite and inside the browser demo store — no native crypto
// dependency, fully verifiable in all three runtimes.
// ---------------------------------------------------------------------------

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotr(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * SHA-256 over a UTF-8 string, returned as 64 lowercase hex characters.
 */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLenHi = 0;
  const bitLenLo = bytes.length * 8;

  // Pre-processing: append 0x80 then pad to 64-byte block boundary, leaving
  // the final 8 bytes for the 64-bit big-endian message length.
  let paddedLen = (((bytes.length + 8) >> 6) + 1) << 6;
  if (bytes.length + 9 > paddedLen) paddedLen += 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  // Initial hash constants (FIPS 180-4, section 5.3.3).
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Array<number>(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(words[i - 15], 7) ^ rotr(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotr(words[i - 2], 17) ^ rotr(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const bigSig1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + bigSig1 + ch + SHA256_K[i] + words[i]) | 0;
      const bigSig0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigSig0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  function wordHex(value: number): string {
    return (
      ((value >>> 24) & 0xff).toString(16).padStart(2, "0") +
      ((value >>> 16) & 0xff).toString(16).padStart(2, "0") +
      ((value >>> 8) & 0xff).toString(16).padStart(2, "0") +
      (value & 0xff).toString(16).padStart(2, "0")
    );
  }

  return wordHex(h0) + wordHex(h1) + wordHex(h2) + wordHex(h3) + wordHex(h4) + wordHex(h5) + wordHex(h6) + wordHex(h7);
}

/**
 * Canonical evidence payload — the exact byte string that integrity hashes and
 * verifies. Field order and label syntax are fixed so the hash is reproducible
 * from the persisted record alone.
 */
export function canonicalEvidencePayload(input: { assetId: string; controlId: string; observedValue: string; timestamp: string }): string {
  return [
    "NEXUS-EVIDENCE-1",
    `assetId=${input.assetId}`,
    `controlId=${input.controlId}`,
    `observedValue=${input.observedValue}`,
    `timestamp=${input.timestamp}`,
  ].join("\n");
}