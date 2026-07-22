/**
 * Graduation Ticket Sender — menu and workbook setup.
 *
 * Bound to a Google Sheet owned and operated by office@torontoacademy.ca.
 * The script prepares and sends individual admission-ticket emails from a
 * signed Send Queue exported by the check-in application, and exports the
 * per-attempt results back for import.
 *
 * SAFETY: no time-driven or onEdit trigger sends email. Nothing is sent when
 * the Sheet opens or changes. Every send is a deliberate menu action.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Graduation Tickets')
    .addItem('Setup Workbook', 'setupWorkbook')
    .addItem('Load Send Queue CSV', 'loadSendQueueCsv')
    .addItem('Load Send Queue CSV from Drive', 'loadSendQueueCsvFromDrive')
    .addItem('Archive and Load New Batch from Drive', 'archiveAndLoadNewBatchFromDrive')
    .addSeparator()
    .addItem('Validate Batch', 'validateBatch')
    .addItem('Send Test for Selected Row', 'sendTestForSelectedRow')
    .addItem('Send Selected', 'sendSelected')
    .addItem('Send Next 25', 'sendNext25')
    .addItem('Resume Failed', 'resumeFailed')
    .addSeparator()
    .addItem('Scan Bounce Messages', 'scanBounceMessages')
    .addItem('Export New Results for Active Batch', 'exportNewResultsForActiveBatch')
    .addItem('Re-export All Results for Active Batch', 'reExportAllResultsForActiveBatch')
    .addItem('Show Remaining Email Quota', 'showRemainingQuota')
    .addToUi();
}

/** Creates or validates every required tab. Idempotent. */
function setupWorkbook() {
  var ss = SpreadsheetApp.getActive();
  ensureConfigTab_(ss);
  ensureSummaryTab_(ss);
  ensureQueueTab_(ss);
  ensureLogTab_(ss);
  ensureBounceTab_(ss);
  ensureArchiveTab_(ss);
  SpreadsheetApp.getUi().alert(
    'Workbook ready. Fill in the Configuration tab, then Load Send Queue CSV.'
  );
}

function ensureConfigTab_(ss) {
  var sheet = ss.getSheetByName(TAB.CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(TAB.CONFIG);
  }
  var existing = {};
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    existing[String(values[i][0]).trim()] = true;
  }
  if (values.length === 0 || String(values[0][0]).trim() !== 'Key') {
    sheet.clear();
    sheet.appendRow(['Key', 'Value']);
  }
  for (var k = 0; k < CONFIG_KEYS.length; k++) {
    var key = CONFIG_KEYS[k];
    if (!existing[key]) {
      sheet.appendRow([key, CONFIG_DEFAULTS[key]]);
    }
  }
}

function ensureSummaryTab_(ss) {
  var sheet = ss.getSheetByName(TAB.SUMMARY);
  if (!sheet) {
    sheet = ss.insertSheet(TAB.SUMMARY);
    sheet.appendRow(['Field', 'Value']);
    sheet.appendRow(['delivery_batch_code', '']);
    sheet.appendRow(['event_code', '']);
    sheet.appendRow(['delivery_mode', '']);
    sheet.appendRow(['prepared_count', '']);
    sheet.appendRow(['loaded_at', '']);
  }
  // Additively ensure the protected active-batch identity fields exist. These
  // are populated from the loaded signed queue, never typed by hand.
  var existing = {};
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    existing[String(values[i][0]).trim()] = true;
  }
  var activeFields = [
    ACTIVE_BATCH_FIELDS.CODE,
    ACTIVE_BATCH_FIELDS.MODE,
    ACTIVE_BATCH_FIELDS.EVENT,
    ACTIVE_BATCH_FIELDS.LOADED_AT
  ];
  for (var a = 0; a < activeFields.length; a++) {
    if (!existing[activeFields[a]]) {
      sheet.appendRow([activeFields[a], '']);
    }
  }
}

function ensureQueueTab_(ss) {
  var sheet = ss.getSheetByName(TAB.QUEUE);
  if (!sheet) {
    sheet = ss.insertSheet(TAB.QUEUE);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SEND_QUEUE_HEADERS.concat(['status', 'attempt_count']));
  }
}

function ensureLogTab_(ss) {
  var sheet = ss.getSheetByName(TAB.LOG);
  if (!sheet) {
    sheet = ss.insertSheet(TAB.LOG);
    sheet.appendRow(LOG_HEADERS);
    return;
  }
  // Additively add any missing header columns to an existing Send Log so an
  // upgraded workbook keeps its history and gains export tracking. Existing
  // columns keep their positions; new columns are appended to the right.
  var header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var present = {};
  for (var c = 0; c < header.length; c++) {
    present[String(header[c]).trim()] = true;
  }
  var toAdd = [];
  for (var h = 0; h < LOG_HEADERS.length; h++) {
    if (!present[LOG_HEADERS[h]]) {
      toAdd.push(LOG_HEADERS[h]);
    }
  }
  if (toAdd.length > 0) {
    sheet
      .getRange(1, header.length + 1, 1, toAdd.length)
      .setValues([toAdd]);
  }
}

function ensureArchiveTab_(ss) {
  var sheet = ss.getSheetByName(TAB.ARCHIVE);
  if (!sheet) {
    sheet = ss.insertSheet(TAB.ARCHIVE);
    sheet.appendRow([
      'archived_at',
      'delivery_batch_code',
      'event_code',
      'delivery_mode',
      'row_count',
      'note'
    ]);
  }
}

function ensureBounceTab_(ss) {
  var sheet = ss.getSheetByName(TAB.BOUNCE);
  if (!sheet) {
    sheet = ss.insertSheet(TAB.BOUNCE);
    sheet.appendRow([
      'recipient_email',
      'delivery_reference',
      'classification',
      'message_date',
      'gmail_message_id',
      'notes'
    ]);
  }
}
