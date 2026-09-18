// Minimal RFC 4180-style CSV parser (SPEC §9.3). Pure, no I/O.
//
// Handles quoted fields, commas and newlines inside quotes, and doubled quotes ("").
// Kept deliberately robust so a future real export (e.g. from PostgreSQL) with quoted
// product names still parses correctly. Returns one object per data row, keyed by the
// header columns.

/**
 * @param {string} text  Raw CSV text (a leading UTF-8 BOM is stripped).
 * @returns {Array<Record<string, string>>}
 */
export function parseCsv(text) {
  const rows = parseRows(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    // Skip blank lines (e.g. a trailing newline produces one empty cell).
    if (cells.length === 1 && cells[0].trim() === '') continue;

    const record = {};
    for (let c = 0; c < header.length; c++) {
      record[header[c]] = cells[c] !== undefined ? cells[c] : '';
    }
    records.push(record);
  }
  return records;
}

// Character-scanning parser → array of rows, each an array of raw field strings.
function parseRows(input) {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }

    field += ch; i++;
  }

  // Flush the final field/row if the text did not end with a newline.
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
