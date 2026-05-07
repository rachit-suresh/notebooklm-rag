const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 160;
const SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "];

export function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLargePiece(piece, chunkSize) {
  if (piece.length <= chunkSize) return [piece];

  const separator = SEPARATORS.find((candidate) => piece.includes(candidate));
  if (!separator || separator === " ") {
    const parts = [];
    for (let start = 0; start < piece.length; start += chunkSize) {
      parts.push(piece.slice(start, start + chunkSize));
    }
    return parts;
  }

  const parts = piece
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current}${separator}${part}` : part;
    if (next.length <= chunkSize) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (part.length > chunkSize) {
      chunks.push(...splitLargePiece(part, chunkSize));
      current = "";
    } else {
      current = part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function overlapTail(text, overlap) {
  if (!overlap || text.length <= overlap) return text;
  const tail = text.slice(-overlap);
  const boundary = tail.search(/[\n.!?]\s+\S/);
  return boundary > 0 ? tail.slice(boundary + 1).trim() : tail.trim();
}

export function chunkText(
  rawText,
  { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP, source = "document" } = {},
) {
  const text = normalizeText(rawText);
  if (!text) return [];

  const pieces = splitLargePiece(text, chunkSize);
  const chunks = [];
  let previous = "";

  for (const piece of pieces) {
    const prefix = chunks.length > 0 ? overlapTail(previous, overlap) : "";
    const body = prefix ? `${prefix}\n${piece}` : piece;
    chunks.push({
      id: `${source}-${chunks.length + 1}`,
      index: chunks.length + 1,
      text: body.trim(),
      source,
    });
    previous = piece;
  }

  return chunks;
}
