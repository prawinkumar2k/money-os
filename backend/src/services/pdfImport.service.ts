import pdfParse from "pdf-parse";
import { ParsedCsvRow } from "./csvImport.service";

// Matches a leading date in DD/MM/YYYY, DD-MM-YYYY, or DD Mon YYYY form.
const DATE_PATTERN = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/;
// The last currency-like number on a line: 1,234.56 / 1234.56, optionally with a trailing Dr/Cr marker.
const AMOUNT_PATTERN = /([\d,]+\.\d{2})\s*(Dr|DR|Cr|CR)?\s*$/;

function parseDate(raw: string): Date | null {
  const isoLike = raw.replace(/-/g, "/");
  const parts = isoLike.split("/");
  if (parts.length === 3 && /^\d+$/.test(parts[0])) {
    // DD/MM/YYYY (the overwhelmingly common Indian bank statement format)
    const [d, m, yRaw] = parts;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Generic bank-statement PDF parser: extracts raw text (pdf-parse) and applies a line-level
 * heuristic — leading date, trailing amount with an optional Dr/Cr marker, description in
 * between. This is NOT a bank-specific parser and will not reliably handle every statement
 * layout (multi-line rows, tables split across columns, scanned/image-only PDFs). Rows it can't
 * confidently parse are flagged with errors rather than guessed at, exactly like the CSV path,
 * so a low-confidence row always requires the user's explicit confirmation before saving.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedCsvRow[]> {
  // multer's memoryStorage can hand back a Buffer that is a *view* into Node's shared small-
  // allocation pool (non-zero byteOffset into a larger underlying ArrayBuffer). pdf-parse (via
  // pdf.js) reads the underlying ArrayBuffer directly and ignores byteOffset/byteLength, so
  // passing a pooled view silently parses the wrong bytes ("bad XRef entry" on perfectly valid
  // PDFs). Buffer.from() copies into a fresh, unpooled buffer, which sidesteps this entirely.
  // Buffer.from(buffer) is not enough: Node pools ANY small buffer allocation (including copies)
  // under Buffer.poolSize/2 by default, so the copy can still land at a non-zero byteOffset into
  // a shared ArrayBuffer. allocUnsafeSlow guarantees its own dedicated, non-pooled ArrayBuffer.
  const isolated = Buffer.allocUnsafeSlow(buffer.length);
  buffer.copy(isolated);
  const { text } = await pdfParse(isolated);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: ParsedCsvRow[] = [];
  let rowNumber = 1;

  for (const line of lines) {
    const dateMatch = line.match(DATE_PATTERN);
    if (!dateMatch) continue; // not a transaction line (header/footer/balance summary etc.) — skip silently

    rowNumber += 1;
    const errors: string[] = [];

    const date = parseDate(dateMatch[1]);
    if (!date) errors.push(`Unrecognized date: "${dateMatch[1]}"`);

    const amountMatch = line.match(AMOUNT_PATTERN);
    let amount: number | null = null;
    if (amountMatch) {
      const magnitude = Number(amountMatch[1].replace(/,/g, ""));
      const marker = amountMatch[2]?.toLowerCase();
      // Dr (debit) = money out = negative; Cr (credit) = money in = positive.
      // No marker: can't tell direction confidently — flagged as an error, not guessed.
      if (marker === "dr") amount = -Math.abs(magnitude);
      else if (marker === "cr") amount = Math.abs(magnitude);
      else errors.push("Could not determine whether this is a debit or credit (no Dr/Cr marker found)");
    } else {
      errors.push("Could not find a transaction amount on this line");
    }

    const description = line
      .slice(dateMatch[0].length, amountMatch ? line.lastIndexOf(amountMatch[0]) : undefined)
      .trim();
    if (!description) errors.push("No description text found between date and amount");

    rows.push({
      rowNumber,
      date,
      description: description || "(no description)",
      merchant: null,
      amount,
      raw: { line },
      errors,
    });
  }

  return rows;
}
