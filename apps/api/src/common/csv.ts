function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function rowsToCsv(headers: unknown[], rows: unknown[][]): string {
  return `\uFEFF${headers.map(csvEscape).join(',')}\n${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`;
}
