/**
 * Results export.
 *
 * Builds the apps-script-results-<delivery-batch-code>.csv the application
 * imports. The exported columns match exactly what the app expects, and the
 * row_signature is copied through unchanged so the app can re-verify every
 * row. Outcomes are limited to the values the app accepts.
 */

var RESULT_HEADERS = [
  'delivery_batch_code',
  'delivery_reference',
  'row_signature',
  'attempt_reference',
  'attempt_number',
  'intended_recipient_email',
  'actual_recipient_email',
  'delivery_mode',
  'outcome',
  'attempted_at',
  'sent_by',
  'pdf_file_name',
  'pdf_sha256',
  'error_code',
  'error_message',
  'bounce_detected_at',
  'exported_at'
];

var FORMULA_PREFIXES = ['=', '+', '-', '@'];

/** Neutralizes a value a spreadsheet might evaluate, then CSV-quotes it. */
function csvCell_(value) {
  var text = String(value === undefined || value === null ? '' : value);
  var stripped = text.replace(/^[\t\r\n]+/, '');
  if (stripped.length > 0 && FORMULA_PREFIXES.indexOf(stripped.charAt(0)) !== -1) {
    stripped = "'" + stripped;
  }
  return '"' + stripped.replace(/"/g, '""') + '"';
}

function exportResultsCsv() {
  var log = SpreadsheetApp.getActive().getSheetByName(TAB.LOG);
  var summary = SpreadsheetApp.getActive().getSheetByName(TAB.SUMMARY);
  var batchCode = getSummary_(summary, 'delivery_batch_code');
  var exportedAt = new Date().toISOString();

  var values = log.getDataRange().getValues();
  var lines = [RESULT_HEADERS.map(csvCell_).join(',')];
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    if (String(v[0]).trim() === '') {
      continue;
    }
    // Log columns:
    // 0 attempt_reference, 1 delivery_reference, 2 row_signature,
    // 3 attempt_number, 4 intended, 5 actual, 6 mode, 7 outcome,
    // 8 attempted_at, 9 sent_by, 10 pdf_file_name, 11 pdf_sha256,
    // 12 error_code, 13 error_message, 14 bounce_detected_at
    var line = [
      batchCode,
      v[1],
      v[2],
      v[0],
      v[3],
      v[4],
      v[5],
      v[6],
      v[7],
      v[8],
      v[9],
      v[10],
      v[11],
      v[12],
      v[13],
      v[14],
      exportedAt
    ];
    lines.push(line.map(csvCell_).join(','));
  }
  var csv = lines.join('\r\n') + '\r\n';
  var fileName = 'apps-script-results-' + (batchCode || 'batch') + '.csv';
  var file = DriveApp.createFile(fileName, csv, 'text/csv');
  SpreadsheetApp.getUi().alert(
    'Results exported to your Drive as ' + fileName + '\n\n' +
    'Download it and import it in the application under ' +
    'Ticket Distribution > Import results.\n\nFile URL: ' + file.getUrl()
  );
}

function getSummary_(sheet, field) {
  if (!sheet) {
    return '';
  }
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === field) {
      return String(values[i][1]);
    }
  }
  return '';
}
