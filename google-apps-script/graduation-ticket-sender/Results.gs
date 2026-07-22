/**
 * Results export (CHECKIN-09C, active-batch scoped).
 *
 * ROOT CAUSE THIS FILE FIXES
 * The previous exporter read the batch code from the Batch Summary tab and
 * stamped it onto every Send Log row, then wrote EVERY log row to the file.
 * The Send Log is append-only and is never cleared when a new queue is loaded,
 * so attempts left over from an earlier batch stayed in the log and were
 * exported under the current batch code. That is exactly how a file named for
 * DLV-2026-BDH4YG came to contain an unrelated attempt from another batch. The
 * application's importer caught it (the leftover row's signature did not match
 * the active batch, so it was rejected), but the export must not produce that
 * file in the first place.
 *
 * THE FIX
 * Every Send Log row now records its own delivery_batch_code, and the export
 * selects only rows that belong to ACTIVE_BATCH_CODE and ACTIVE_BATCH_MODE,
 * have a terminal outcome, and have not already been exported. Selection is a
 * pure function (selectExportRows_) so it can be unit tested off a Sheet. Rows
 * are marked exported only after the Drive file is created, and a zero-row
 * export writes no file at all.
 *
 * The exported CSV columns and the row_signature pass-through are unchanged, so
 * the application importer and all of its signature, recipient and checksum
 * protections keep working exactly as before.
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

/**
 * Outcomes that represent a completed attempt worth exporting. A row without a
 * terminal outcome (e.g. an in-flight 'skipped' marker) is not exported.
 */
var TERMINAL_LOG_OUTCOMES = ['sent', 'test_sent', 'failed', 'bounce_detected', 'cancelled'];

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

/** Builds a header-name -> column-index map from a Send Log header row. */
function logColumnIndex_(header) {
  var index = {};
  for (var c = 0; c < header.length; c++) {
    index[String(header[c]).trim()] = c;
  }
  return index;
}

/** True when the outcome is a terminal, exportable result. Pure. */
function isTerminalOutcome_(outcome) {
  return TERMINAL_LOG_OUTCOMES.indexOf(String(outcome).trim().toLowerCase()) !== -1;
}

/**
 * Pure selection of Send Log rows for an active-batch export.
 *
 *   dataRows        Send Log rows below the header (arrays of cell values).
 *   colIndex        header-name -> column-index map (from logColumnIndex_).
 *   activeBatchCode the one batch an export is allowed to touch.
 *   activeMode      the one mode ('test' | 'production') it is allowed to touch.
 *   includeExported when false, already-exported rows are skipped (the default
 *                   "new results" behaviour); when true, they are included
 *                   (the explicit re-export recovery action). Either way the
 *                   selection stays strictly inside the active batch.
 *
 * Returns { rows, rowNumbers, skippedExported, skippedOtherBatch,
 * skippedNonTerminal }. rowNumbers are 1-based Sheet row numbers so the caller
 * can mark exactly the exported rows afterwards.
 */
function selectExportRows_(dataRows, colIndex, activeBatchCode, activeMode, includeExported) {
  var out = {
    rows: [],
    rowNumbers: [],
    skippedExported: 0,
    skippedOtherBatch: 0,
    skippedNonTerminal: 0
  };
  var wantBatch = String(activeBatchCode === undefined ? '' : activeBatchCode).trim();
  var wantMode = String(activeMode === undefined ? '' : activeMode).trim().toLowerCase();
  var refIdx = colIndex.delivery_reference;
  var batchIdx = colIndex.delivery_batch_code;
  var modeIdx = colIndex.delivery_mode;
  var outcomeIdx = colIndex.outcome;
  var exportIdx = colIndex.export_status;

  for (var i = 0; i < dataRows.length; i++) {
    var row = dataRows[i];
    if (String(row[refIdx] === undefined ? '' : row[refIdx]).trim() === '') {
      continue;
    }
    var code = String(row[batchIdx] === undefined ? '' : row[batchIdx]).trim();
    var mode = String(row[modeIdx] === undefined ? '' : row[modeIdx]).trim().toLowerCase();

    // Strict active-batch isolation: a row from any other batch or mode is
    // never included, which is the safeguard against the mixed-batch export.
    if (wantBatch !== '' && code !== wantBatch) {
      out.skippedOtherBatch += 1;
      continue;
    }
    if (wantMode !== '' && mode !== wantMode) {
      out.skippedOtherBatch += 1;
      continue;
    }
    if (!isTerminalOutcome_(row[outcomeIdx])) {
      out.skippedNonTerminal += 1;
      continue;
    }
    var exportStatus = String(
      exportIdx === undefined || row[exportIdx] === undefined ? '' : row[exportIdx]
    ).trim().toLowerCase();
    if (!includeExported && exportStatus === 'exported') {
      out.skippedExported += 1;
      continue;
    }

    out.rows.push(row);
    out.rowNumbers.push(i + 2); // +1 header row, +1 for 1-based Sheet rows.
  }
  return out;
}

/**
 * Shared export engine. includeExported selects the default (new only) or the
 * recovery (re-export all) behaviour. Never sends email, never creates an
 * attempt and never edits recipient data: it only reads the log and marks
 * exported rows after the file exists.
 */
function exportResultsForActiveBatch_(includeExported, actionLabel) {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  var log = ss.getSheetByName(TAB.LOG);
  var summary = ss.getSheetByName(TAB.SUMMARY);

  var activeBatchCode = String(
    getSummary_(summary, ACTIVE_BATCH_FIELDS.CODE) ||
    getSummary_(summary, 'delivery_batch_code')
  ).trim();
  var activeMode = String(
    getSummary_(summary, ACTIVE_BATCH_FIELDS.MODE) ||
    getSummary_(summary, 'delivery_mode')
  ).trim().toLowerCase();

  if (activeBatchCode === '') {
    ui.alert('No active batch is loaded. Load a signed send queue before exporting.');
    return;
  }
  if (!log) {
    ui.alert('Send Log tab is missing. Run Setup Workbook first.');
    return;
  }

  var values = log.getDataRange().getValues();
  if (values.length < 2) {
    ui.alert('No new results are available for the active batch.');
    return;
  }
  var colIndex = logColumnIndex_(values[0]);
  if (colIndex.delivery_batch_code === undefined) {
    ui.alert(
      'This Send Log predates active-batch export tracking. Run Setup Workbook ' +
      'to add the delivery_batch_code and export tracking columns, then send ' +
      'again before exporting.'
    );
    return;
  }
  var dataRows = values.slice(1);
  var selection = selectExportRows_(
    dataRows,
    colIndex,
    activeBatchCode,
    activeMode,
    includeExported === true
  );

  // Zero rows: show a clear message and DO NOT create an empty CSV.
  if (selection.rows.length === 0) {
    ui.alert('No new results are available for the active batch.');
    return;
  }

  var exportedAt = new Date().toISOString();
  var runReference =
    'EXP-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();

  var lines = [RESULT_HEADERS.map(csvCell_).join(',')];
  for (var r = 0; r < selection.rows.length; r++) {
    var v = selection.rows[r];
    var line = [
      activeBatchCode, // canonical active batch code, not a per-row guess
      v[colIndex.delivery_reference],
      v[colIndex.row_signature],
      v[colIndex.attempt_reference],
      v[colIndex.attempt_number],
      v[colIndex.intended_recipient_email],
      v[colIndex.actual_recipient_email],
      v[colIndex.delivery_mode],
      v[colIndex.outcome],
      v[colIndex.attempted_at],
      v[colIndex.sent_by],
      v[colIndex.pdf_file_name],
      v[colIndex.pdf_sha256],
      v[colIndex.error_code],
      v[colIndex.error_message],
      v[colIndex.bounce_detected_at],
      exportedAt
    ];
    lines.push(line.map(csvCell_).join(','));
  }
  var csv = lines.join('\r\n') + '\r\n';
  var fileName =
    'apps-script-results-' + activeBatchCode + '-' + runReference + '.csv';

  // Create the file first; only mark rows exported once it exists.
  var file = DriveApp.createFile(fileName, csv, 'text/csv');

  var esCol = colIndex.export_status + 1;
  var eaCol = colIndex.exported_at + 1;
  var efCol = colIndex.export_file_name + 1;
  var erCol = colIndex.export_run_reference + 1;
  for (var s = 0; s < selection.rowNumbers.length; s++) {
    var rowNum = selection.rowNumbers[s];
    log.getRange(rowNum, esCol).setValue('exported');
    log.getRange(rowNum, eaCol).setValue(exportedAt);
    log.getRange(rowNum, efCol).setValue(fileName);
    log.getRange(rowNum, erCol).setValue(runReference);
  }
  SpreadsheetApp.flush();

  ui.alert(
    actionLabel + ' complete.\n\n' +
    'Active batch: ' + activeBatchCode + '\n' +
    'Mode: ' + activeMode + '\n' +
    'New rows exported: ' + selection.rows.length + '\n' +
    'Already exported rows skipped: ' + selection.skippedExported + '\n' +
    'File name: ' + fileName + '\n\n' +
    'Download it and import it in the application under ' +
    'Ticket Distribution > Import results.\n\nDrive URL: ' + file.getUrl()
  );
}

/** Default menu action: only new, unexported terminal rows for the active batch. */
function exportNewResultsForActiveBatch() {
  exportResultsForActiveBatch_(false, 'Export New Results for Active Batch');
}

/**
 * Recovery menu action: re-exports every terminal row for the active batch,
 * including rows already exported. Still strictly active-batch scoped.
 */
function reExportAllResultsForActiveBatch() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    'Re-export All Results for Active Batch',
    'This re-exports every terminal result for the active batch, including ' +
    'rows already exported. It stays limited to the active batch. Continue?',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) {
    return;
  }
  exportResultsForActiveBatch_(true, 'Re-export All Results for Active Batch');
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
