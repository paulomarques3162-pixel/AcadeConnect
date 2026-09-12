import ExcelJS from 'exceljs';

/**
 * Build a CSV string from an array of objects.
 */
export function toCsv(rows, columns) {
  const headers = columns.map((c) => c.header);
  const lines = [headers.join(';')];
  for (const row of rows) {
    const values = columns.map((c) => {
      const v = row[c.key] ?? '';
      return String(v).replace(/;/g, ',').replace(/\n/g, ' ');
    });
    lines.push(values.join(';'));
  }
  return lines.join('\n');
}

/**
 * Build an XLSX Buffer from an array of objects.
 */
export async function toXlsx(rows, columns, sheetName = 'Dados') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || 20,
  }));
  for (const row of rows) {
    sheet.addRow(row);
  }
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
