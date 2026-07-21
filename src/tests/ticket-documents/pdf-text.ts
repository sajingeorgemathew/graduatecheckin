/**
 * Test helper: reads printed text back out of a generated PDF.
 *
 * @react-pdf/renderer writes Flate-compressed content streams, so the
 * streams are inflated before the literal PDF strings are collected. The
 * document uses the PDF core Helvetica family with WinAnsi encoding, so
 * printed text appears directly as (...) string literals.
 */

import { inflateSync } from "node:zlib";

/** Inflates every stream in the file that can be inflated. */
function inflatedStreams(bytes: Uint8Array): string[] {
  const buffer = Buffer.from(bytes);
  const out: string[] = [];
  let index = 0;
  for (;;) {
    const start = buffer.indexOf("stream", index);
    if (start < 0) {
      break;
    }
    let from = start + "stream".length;
    if (buffer[from] === 0x0d) {
      from += 1;
    }
    if (buffer[from] === 0x0a) {
      from += 1;
    }
    const end = buffer.indexOf("endstream", from);
    if (end < 0) {
      break;
    }
    try {
      out.push(inflateSync(buffer.subarray(from, end)).toString("latin1"));
    } catch {
      // Image and font streams are not Flate text; skip them.
    }
    index = end + "endstream".length;
  }
  return out;
}

function decodeHexString(hex: string): string {
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

/**
 * Concatenates every printed string in page order.
 *
 * @react-pdf/renderer emits text as hex strings inside TJ arrays, with
 * kerning numbers between them, for example:
 *   [<54> 80 <6f> 0 <726f6e746f>] TJ
 * The hex bytes are single-byte codes in the font's encoding, which for the
 * core Helvetica family is ASCII-compatible. Literal (...) Tj strings are
 * also accepted so the helper stays correct if the writer changes.
 */
export function extractPdfText(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (const stream of inflatedStreams(bytes)) {
    if (!stream.includes("BT") || !stream.includes("Tf")) {
      continue;
    }
    // Each TJ array becomes one logical run of text.
    const arrayRe = /\[((?:[^\][]|\\.)*)\]\s*TJ/g;
    let match: RegExpExecArray | null;
    while ((match = arrayRe.exec(stream)) !== null) {
      const hexRe = /<([0-9A-Fa-f]*)>/g;
      let piece: RegExpExecArray | null;
      let run = "";
      while ((piece = hexRe.exec(match[1])) !== null) {
        run += decodeHexString(piece[1]);
      }
      if (run.length > 0) {
        parts.push(run);
      }
    }
    const literalRe = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
    while ((match = literalRe.exec(stream)) !== null) {
      parts.push(match[1].replace(/\\([()\\])/g, "$1"));
    }
    const hexTjRe = /<([0-9A-Fa-f]+)>\s*Tj/g;
    while ((match = hexTjRe.exec(stream)) !== null) {
      parts.push(decodeHexString(match[1]));
    }
  }
  return parts.join("\n");
}

/**
 * Removes all whitespace so assertions are insensitive to how the PDF
 * writer split a phrase.
 *
 * Two unrelated things break naive matching: interpolated JSX values become
 * separate text runs ("Admits " + "3"), and a wrapped line is emitted as
 * separate runs with the wrap-point space dropped. Comparing
 * whitespace-stripped forms makes both cases match the intended phrase.
 */
export function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Extracts printed text already normalized for phrase matching. */
export function extractPdfMatchText(bytes: Uint8Array): string {
  return normalizeForMatch(extractPdfText(bytes));
}

/**
 * Raw searchable form of the whole file, including inflated streams. Used
 * to prove that credential material never appears anywhere in the bytes.
 */
export function extractPdfRaw(bytes: Uint8Array): string {
  return [
    Buffer.from(bytes).toString("latin1"),
    ...inflatedStreams(bytes),
  ].join("\n");
}
