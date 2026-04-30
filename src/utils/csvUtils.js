function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function rowsToCsv(headers, rows) {
  return `\uFEFF${headers.map(csvEscape).join(',')}\n${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`;
}

module.exports = {
  csvEscape,
  rowsToCsv,
};
