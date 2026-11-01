// Spreadsheet formula injection (blueprint §15). Every text cell the workbook writes
// passes through text(): an explicit string, and one that a spreadsheet could read as
// a formula (=, +, -, @, tab, carriage return first) gets a leading apostrophe. The
// apostrophe is part of the stored text, so it shows (ADR 0010).

const FORMULA_START = /^[=+\-@\t\r]/;

export function text(s: string): string {
  const str = String(s);
  return FORMULA_START.test(str) ? `'${str}` : str;
}
