// Workbook formats and colors (blueprint §17). The banker convention: blue font for
// a hardcoded input, black for a formula, green for a link to another sheet.

import type ExcelJS from "exceljs";

export const NUM_FMT = {
  millions: "#,##0.0_);(#,##0.0)", // USD millions
  perShare: "#,##0.00_);(#,##0.00)", // share price, EPS
  multiple: '0.0"x"',
  percent: "0.0%_);(0.0%)",
  date: "yyyy-mm-dd",
  shares: "#,##0.000_);(#,##0.000)", // shares in millions, to the thousand
  dollars: "#,##0_);(#,##0)", // full USD or shares on the Sources sheet
} as const;
export type NumFmt = keyof typeof NUM_FMT;

export const COLOR = {
  input: "FF0000FF",
  formula: "FF000000",
  link: "FF008000",
  muted: "FF808080",
  targetFill: "FFE8EEF7",
  bandFill: "FFF7F7F7",
  rule: "FFBFBFBF",
} as const;

export type Role = "input" | "formula" | "link";

export const font = (
  role: Role | "muted",
  extra: Partial<ExcelJS.Font> = {},
): Partial<ExcelJS.Font> => ({
  name: "Calibri",
  size: 10,
  color: { argb: COLOR[role] },
  ...extra,
});

export const fill = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

export const ruleBelow: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: COLOR.rule } },
};
