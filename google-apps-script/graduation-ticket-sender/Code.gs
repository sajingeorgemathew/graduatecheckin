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
    .addSeparator()
    .addItem('Validate Batch', 'validateBatch')
    .addItem('Send Test for Selected Row', 'sendTestForSelectedRow')
    .addItem('Send Selected', 'sendSelected')
    .addItem('Send Next 25', 'sendNext25')
    .addItem('Resume Failed', 'resumeFailed')
    .addSeparator()
    .addItem('Scan Bounce Messages', 'scanBounceMessages')
    .addItem('Export Results CSV', 'exportResultsCsv')
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
    sheet.appendRow([
      'attempt_reference',
      'delivery_reference',
      'row_signature',
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
      'bounce_detected_at'
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
