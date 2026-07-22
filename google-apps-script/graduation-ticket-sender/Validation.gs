/**
 * Send Queue loading and validation.
 *
 * The Send Queue is the signed CSV exported by the check-in application. The
 * row_signature is opaque here: the Sheet never alters it, and the app
 * re-verifies it on results import, rejecting any row whose recipient, PDF
 * checksum or mode was edited. This file only checks that the queue is
 * structurally usable before any send.
 *
 * LOADING is deliberately parser-first. The paste dialog and the Drive loader
 * share one pure parser (parseSendQueue_) so the exact CSV the application
 * exports — 23 columns, CRLF or LF, a blank document_generated_at, an app
 * status of `prepared` — always loads without manual edits. The parser never
 * silently drops every row: it reports loaded, skipped and rejected counts and
 * the exact reason when zero rows load.
 */

/**
 * The 21 required columns, in order, exactly as the application exports them.
 * The export appends two more columns — `status` and `attempt_count` — which
 * are also the operational columns the Sheet keeps, so a loaded header is
 * SEND_QUEUE_HEADERS + [status, attempt_count].
 */
var SEND_QUEUE_HEADERS = [
  'delivery_batch_code',
  'delivery_reference',
  'row_signature',
  'event_code',
  'event_title',
  'delivery_mode',
  'delivery_purpose',
  'graduate_name',
  'intended_recipient_email',
  'ticket_code',
  'document_version',
  'pdf_file_name',
  'pdf_sha256',
  'graduate_count',
  'adult_guest_count',
  'adult_guest_names',
  'child_0_4_count',
  'child_5_10_count',
  'total_party_count',
  'document_generated_at',
  'delivery_prepared_at'
];

var STATUS_COL_NAME = 'status';
var ATTEMPT_COL_NAME = 'attempt_count';

/**
 * Fields that must never be blank in an exported row. Everything else,
 * including document_generated_at and adult_guest_names, may legitimately be
 * empty (e.g. a graduate with no guests), so blank values there are preserved
 * rather than rejected.
 */
var REQUIRED_NONEMPTY_FIELDS = [
  'delivery_batch_code',
  'delivery_reference',
  'row_signature',
  'event_code',
  'delivery_mode',
  'delivery_purpose',
  'graduate_name',
  'intended_recipient_email',
  'ticket_code',
  'pdf_file_name',
  'pdf_sha256'
];

/**
 * Maps the application delivery status to the operational Sheet status used by
 * the sending engine. Returns null for an unknown status so the row can be
 * rejected with a clear message. The original app status is preserved
 * separately on the parsed row (appStatus) in case both are ever needed.
 */
function operationalStatusFor_(appStatus) {
  var map = {
    prepared: 'READY',
    resend_required: 'READY',
    sent: 'SENT',
    resent: 'SENT',
    failed: 'FAILED',
    bounce_detected: 'FAILED',
    cancelled: 'CANCELLED',
    suppressed: 'SUPPRESSED'
  };
  var key = String(appStatus).toLowerCase();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

/**
 * A pure RFC 4180 CSV parser. Works in Apps Script and in Node (so it can be
 * unit-tested) with no dependency on Utilities.parseCsv, whose newline
 * handling is not guaranteed across LF/CRLF. Handles quoted fields containing
 * commas, quotes and newlines, tolerates LF or CRLF line endings, strips a
 * leading UTF-8 BOM, and never emits a spurious trailing empty row for a CSV
 * that ends with a newline.
 */
function parseDelimitedText_(text) {
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;
  var started = false;
  var i = 0;
  var source = String(text);
  var n = source.length;
  if (n > 0 && source.charCodeAt(0) === 0xFEFF) {
    i = 1;
  }
  while (i < n) {
    var ch = source.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && source.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      started = true;
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && i + 1 < n && source.charAt(i + 1) === '\n') {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      started = false;
      i += 1;
      continue;
    }
    field += ch;
    started = true;
    i += 1;
  }
  if (started || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parses and validates the send-queue CSV text without touching the Sheet.
 * Returns a structured result:
 *   { ok, error, header, rows, loaded, skipped, rejected, rejections }
 * Each accepted row carries { values (21 core), appStatus, status, attemptCount }.
 * This is the single source of truth for both the paste dialog and the Drive
 * loader.
 */
function parseSendQueue_(text) {
  var result = {
    ok: false,
    error: '',
    header: [],
    rows: [],
    loaded: 0,
    skipped: 0,
    rejected: 0,
    rejections: []
  };

  if (text === undefined || text === null || String(text).trim() === '') {
    result.error =
      'The CSV was empty. Paste or select the send-queue CSV exported by the application.';
    return result;
  }

  var grid = parseDelimitedText_(String(text));
  if (grid.length === 0) {
    result.error = 'The CSV had no rows.';
    return result;
  }

  var header = grid[0].map(function (cell) {
    return String(cell).trim();
  });
  result.header = header;

  for (var h = 0; h < SEND_QUEUE_HEADERS.length; h++) {
    if (header[h] !== SEND_QUEUE_HEADERS[h]) {
      result.error =
        'Unexpected or missing column at position ' + (h + 1) + '. Expected "' +
        SEND_QUEUE_HEADERS[h] + '" but found "' +
        (header[h] === undefined ? '(none)' : header[h]) + '". Export a fresh ' +
        'send-queue CSV from the application without editing the header.';
      return result;
    }
  }

  var allowedExtra = [STATUS_COL_NAME, ATTEMPT_COL_NAME];
  for (var e = SEND_QUEUE_HEADERS.length; e < header.length; e++) {
    if (allowedExtra.indexOf(header[e]) === -1) {
      result.error =
        'Unknown extra column "' + header[e] + '" at position ' + (e + 1) +
        '. The application export defines exactly ' +
        (SEND_QUEUE_HEADERS.length + allowedExtra.length) + ' columns.';
      return result;
    }
  }

  var statusIdx = header.indexOf(STATUS_COL_NAME);
  var attemptIdx = header.indexOf(ATTEMPT_COL_NAME);

  for (var r = 1; r < grid.length; r++) {
    var raw = grid[r];

    var allBlank = true;
    for (var b = 0; b < raw.length; b++) {
      if (String(raw[b]).trim() !== '') {
        allBlank = false;
        break;
      }
    }
    if (allBlank) {
      result.skipped += 1;
      continue;
    }

    if (raw.length < SEND_QUEUE_HEADERS.length || raw.length > header.length) {
      result.rejected += 1;
      result.rejections.push(
        'Row ' + (r + 1) + ': expected ' + SEND_QUEUE_HEADERS.length + ' to ' +
        header.length + ' columns but found ' + raw.length + '.'
      );
      continue;
    }

    var missingField = null;
    for (var f = 0; f < REQUIRED_NONEMPTY_FIELDS.length; f++) {
      var fname = REQUIRED_NONEMPTY_FIELDS[f];
      var fidx = SEND_QUEUE_HEADERS.indexOf(fname);
      if (String(raw[fidx] === undefined ? '' : raw[fidx]).trim() === '') {
        missingField = fname;
        break;
      }
    }
    if (missingField) {
      result.rejected += 1;
      result.rejections.push(
        'Row ' + (r + 1) + ': required field "' + missingField + '" is blank.'
      );
      continue;
    }

    var appStatus =
      statusIdx === -1
        ? 'prepared'
        : String(raw[statusIdx] === undefined ? '' : raw[statusIdx]).trim();
    if (appStatus === '') {
      appStatus = 'prepared';
    }
    var operational = operationalStatusFor_(appStatus);
    if (operational === null) {
      result.rejected += 1;
      result.rejections.push(
        'Row ' + (r + 1) + ': unknown delivery status "' + appStatus + '".'
      );
      continue;
    }

    var attemptRaw =
      attemptIdx === -1
        ? '0'
        : String(raw[attemptIdx] === undefined ? '' : raw[attemptIdx]).trim();
    var attemptCount = parseInt(attemptRaw, 10);
    if (isNaN(attemptCount) || attemptCount < 0) {
      attemptCount = 0;
    }

    result.rows.push({
      values: raw.slice(0, SEND_QUEUE_HEADERS.length),
      appStatus: appStatus,
      status: operational,
      attemptCount: attemptCount,
      sourceLine: r + 1
    });
    result.loaded += 1;
  }

  if (result.loaded === 0) {
    var reasons = result.rejections.slice(0, 10);
    if (reasons.length === 0) {
      result.error =
        'No data rows were found below the header. Make sure you exported the ' +
        'full send-queue CSV including the graduate rows.';
    } else {
      result.error =
        'No rows loaded. ' + result.rejected + ' row(s) were rejected:\n' +
        reasons.join('\n');
    }
    return result;
  }

  result.ok = true;
  return result;
}

/**
 * Pure active-batch isolation check. A loadable queue must describe exactly one
 * batch: one delivery_batch_code, one event_code and one delivery_mode across
 * every row. A file that mixes two batches is rejected here, before anything
 * touches the Sheet, so two queues can never be combined into one send list.
 * Returns { ok, error, batchCode, eventCode, mode }.
 */
function evaluateQueueIsolation_(parsedRows) {
  var result = { ok: false, error: '', batchCode: '', eventCode: '', mode: '' };
  if (!parsedRows || parsedRows.length === 0) {
    result.error = 'The queue contained no rows.';
    return result;
  }
  var batchIdx = SEND_QUEUE_HEADERS.indexOf('delivery_batch_code');
  var eventIdx = SEND_QUEUE_HEADERS.indexOf('event_code');
  var modeIdx = SEND_QUEUE_HEADERS.indexOf('delivery_mode');

  var batchCodes = {};
  var eventCodes = {};
  var modes = {};
  for (var i = 0; i < parsedRows.length; i++) {
    var v = parsedRows[i].values;
    batchCodes[String(v[batchIdx] === undefined ? '' : v[batchIdx]).trim()] = true;
    eventCodes[String(v[eventIdx] === undefined ? '' : v[eventIdx]).trim()] = true;
    modes[String(v[modeIdx] === undefined ? '' : v[modeIdx]).trim().toLowerCase()] = true;
  }
  var batchKeys = Object.keys(batchCodes);
  var eventKeys = Object.keys(eventCodes);
  var modeKeys = Object.keys(modes);

  if (batchKeys.length !== 1) {
    result.error =
      'The queue mixes ' + batchKeys.length + ' delivery batch codes (' +
      batchKeys.join(', ') + '). A queue must contain exactly one batch. Export ' +
      'a fresh single-batch send queue from the application.';
    return result;
  }
  if (eventKeys.length !== 1) {
    result.error =
      'The queue mixes ' + eventKeys.length + ' event codes (' +
      eventKeys.join(', ') + '). A queue must contain exactly one event.';
    return result;
  }
  if (modeKeys.length !== 1) {
    result.error =
      'The queue mixes ' + modeKeys.length + ' delivery modes (' +
      modeKeys.join(', ') + '). A queue must contain exactly one mode.';
    return result;
  }
  result.ok = true;
  result.batchCode = batchKeys[0];
  result.eventCode = eventKeys[0];
  result.mode = modeKeys[0];
  return result;
}

/**
 * Pure decision for whether an incoming queue may replace the active one.
 * Replacing an active batch that still has unsent rows requires an explicit
 * archive-and-replace; reloading the same batch, or loading when nothing is
 * active or nothing is unsent, is always allowed. Returns
 * { allowed, requiresArchive, message }.
 */
function queueReplacementDecision_(activeBatchCode, hasUnsentRows, incomingBatchCode, forceReplace) {
  var active = String(activeBatchCode === undefined ? '' : activeBatchCode).trim();
  var incoming = String(incomingBatchCode === undefined ? '' : incomingBatchCode).trim();
  if (active === '') {
    return { allowed: true, requiresArchive: false, message: '' };
  }
  if (active === incoming) {
    return { allowed: true, requiresArchive: false, message: '' };
  }
  if (!hasUnsentRows) {
    return { allowed: true, requiresArchive: false, message: '' };
  }
  if (forceReplace === true) {
    return { allowed: true, requiresArchive: false, message: '' };
  }
  return {
    allowed: false,
    requiresArchive: true,
    message:
      'Active batch ' + active + ' is still loaded with unsent rows. Sending a ' +
      'different batch would replace it. Use "Archive and Load New Batch from ' +
      'Drive" to archive ' + active + ' first, then load ' + incoming + '.'
  };
}

/** True when the Send Queue still holds rows that have not reached a terminal state. */
function queueHasUnsentRows_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(TAB.QUEUE);
  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }
  var queue = readQueue_();
  for (var i = 0; i < queue.rows.length; i++) {
    var status = String(queue.rows[i].status).toUpperCase();
    if (status === 'READY' || status === 'FAILED' || status === 'SENDING') {
      return true;
    }
  }
  return false;
}

/** Records the currently active batch in the Batch Archive tab before replacement. */
function archiveActiveQueue_(activeBatchCode) {
  var ss = SpreadsheetApp.getActive();
  var archive = ss.getSheetByName(TAB.ARCHIVE);
  if (!archive) {
    return;
  }
  var summary = ss.getSheetByName(TAB.SUMMARY);
  var queue = readQueue_();
  archive.appendRow([
    new Date().toISOString(),
    activeBatchCode,
    getSummary_(summary, ACTIVE_BATCH_FIELDS.EVENT),
    getSummary_(summary, ACTIVE_BATCH_FIELDS.MODE),
    queue.rows.length,
    'Archived on replacement by a new batch load.'
  ]);
}

/**
 * Shared writer for both load paths. Parses the CSV, enforces active-batch
 * isolation, guards a replacement of an active queue, and on success replaces
 * the Send Queue tab with the validated rows, mapping each app status to its
 * operational Sheet status and preserving attempt_count. Returns a result with
 * a human-readable message; it never sends email and never calls the UI so the
 * caller decides how to present the outcome.
 */
function applySendQueueCsv_(csvText, sourceLabel, forceReplace) {
  var parsed = parseSendQueue_(csvText);
  if (!parsed.ok) {
    return {
      ok: false,
      message: 'Load failed (' + sourceLabel + ').\n\n' + parsed.error,
      loaded: 0,
      skipped: parsed.skipped,
      rejected: parsed.rejected
    };
  }

  var isolation = evaluateQueueIsolation_(parsed.rows);
  if (!isolation.ok) {
    return {
      ok: false,
      message: 'Load rejected (' + sourceLabel + ').\n\n' + isolation.error,
      loaded: 0,
      skipped: parsed.skipped,
      rejected: parsed.rejected
    };
  }

  var summaryTab = SpreadsheetApp.getActive().getSheetByName(TAB.SUMMARY);
  var activeBatchCode = summaryTab
    ? String(getSummary_(summaryTab, ACTIVE_BATCH_FIELDS.CODE)).trim()
    : '';
  var decision = queueReplacementDecision_(
    activeBatchCode,
    queueHasUnsentRows_(),
    isolation.batchCode,
    forceReplace === true
  );
  if (!decision.allowed) {
    return {
      ok: false,
      message: 'Load blocked (' + sourceLabel + ').\n\n' + decision.message,
      loaded: 0,
      skipped: 0,
      rejected: 0
    };
  }
  if (
    forceReplace === true &&
    activeBatchCode !== '' &&
    activeBatchCode !== isolation.batchCode
  ) {
    archiveActiveQueue_(activeBatchCode);
  }

  var sheet = SpreadsheetApp.getActive().getSheetByName(TAB.QUEUE);
  if (!sheet) {
    throw new Error('Send Queue tab is missing. Run Setup Workbook first.');
  }
  sheet.clear();
  sheet.appendRow(SEND_QUEUE_HEADERS.concat([STATUS_COL_NAME, ATTEMPT_COL_NAME]));

  var out = [];
  for (var i = 0; i < parsed.rows.length; i++) {
    var row = parsed.rows[i];
    out.push(row.values.concat([row.status, row.attemptCount]));
  }
  if (out.length > 0) {
    sheet
      .getRange(2, 1, out.length, SEND_QUEUE_HEADERS.length + 2)
      .setValues(out);
  }
  updateSummaryFromQueue_();

  var message =
    'Loaded ' + parsed.loaded + ' queue row(s) from ' + sourceLabel + '.' +
    '\nSkipped ' + parsed.skipped + ' blank line(s).' +
    '\nRejected ' + parsed.rejected + ' malformed row(s).';
  if (parsed.rejected > 0) {
    message += '\n\nRejected rows:\n' + parsed.rejections.slice(0, 10).join('\n');
  }
  return {
    ok: true,
    message: message,
    loaded: parsed.loaded,
    skipped: parsed.skipped,
    rejected: parsed.rejected
  };
}

/**
 * Menu action: opens a modal dialog with a real multi-line textarea. This
 * replaces the single-line ui.prompt, which silently collapsed the pasted
 * multi-line CSV into one line so Utilities.parseCsv saw a single row and
 * nothing loaded.
 */
function loadSendQueueCsv() {
  var html = HtmlService.createHtmlOutput(sendQueuePasteHtml_())
    .setWidth(620)
    .setHeight(440);
  SpreadsheetApp.getUi().showModalDialog(html, 'Load Send Queue CSV');
}

/**
 * Server endpoint called by the paste dialog. Public (no trailing underscore)
 * so google.script.run can reach it. Returns the summary message string.
 */
function applyPastedSendQueue(csvText) {
  var result = applySendQueueCsv_(csvText, 'Pasted CSV', false);
  return result.message;
}

/**
 * Menu action: loads the single send-queue CSV from DRIVE_BATCH_FOLDER_ID.
 * Fails clearly when zero or more than one matching CSV exists, and shows the
 * selected filename. Uses the same parser as the paste path.
 */
function loadSendQueueCsvFromDrive() {
  loadSendQueueFromDrive_(false);
}

/**
 * Menu action: archives the active batch (if any) and loads a different batch
 * from Drive. This is the explicit archive-and-replace the loader requires
 * before it will replace an active queue that still has unsent rows.
 */
function archiveAndLoadNewBatchFromDrive() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    'Archive and Load New Batch',
    'This archives the currently active batch and replaces the Send Queue with ' +
    'a new batch from Drive. The archived batch can no longer be sent from this ' +
    'sheet. Continue?',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) {
    return;
  }
  loadSendQueueFromDrive_(true);
}

function loadSendQueueFromDrive_(forceReplace) {
  var ui = SpreadsheetApp.getUi();
  var config = readConfig_();
  var folderId = String(config.DRIVE_BATCH_FOLDER_ID || '').trim();
  if (folderId === '') {
    ui.alert(
      'DRIVE_BATCH_FOLDER_ID is not configured. Set it on the Configuration tab.'
    );
    return;
  }

  var matches = findSendQueueCsvFiles_(folderId);
  if (matches.length === 0) {
    ui.alert(
      'No send-queue CSV found in the configured Drive folder. Expected a ' +
      'file named like "send-queue-<batch>.csv".'
    );
    return;
  }
  if (matches.length > 1) {
    var names = [];
    for (var m = 0; m < matches.length; m++) {
      names.push(matches[m].getName());
    }
    ui.alert(
      'Found ' + matches.length + ' send-queue CSV files in the folder. Keep ' +
      'exactly one and remove the rest:\n\n' + names.join('\n')
    );
    return;
  }

  var file = matches[0];
  var csvText = file.getBlob().getDataAsString('UTF-8');
  var result = applySendQueueCsv_(csvText, file.getName(), forceReplace === true);
  ui.alert(result.message);
}

/** Returns every file in the folder whose name matches the export pattern. */
function findSendQueueCsvFiles_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var iter = folder.getFiles();
  var out = [];
  while (iter.hasNext()) {
    var file = iter.next();
    if (/^send-queue-.*\.csv$/i.test(String(file.getName()))) {
      out.push(file);
    }
  }
  return out;
}

/** The paste dialog markup. A textarea preserves multi-line pasted CSV. */
function sendQueuePasteHtml_() {
  return [
    '<!DOCTYPE html><html><head><base target="_top">',
    '<style>',
    'body{font-family:Arial,Helvetica,sans-serif;margin:12px;color:#202124;}',
    'p{margin:0 0 8px;font-size:13px;}',
    'textarea{width:100%;height:280px;box-sizing:border-box;font-family:monospace;',
    'font-size:12px;white-space:pre;}',
    '.bar{margin-top:10px;text-align:right;}',
    'button{font-size:13px;padding:6px 14px;margin-left:8px;}',
    '#status{font-size:12px;color:#5f6368;margin-top:8px;white-space:pre-wrap;}',
    '</style></head><body>',
    '<p>Paste the full send-queue CSV exported by the application, then click ',
    'Load. Line breaks are preserved.</p>',
    '<textarea id="csv" placeholder="delivery_batch_code,delivery_reference,..."></textarea>',
    '<div id="status"></div>',
    '<div class="bar">',
    '<button onclick="google.script.host.close()">Cancel</button>',
    '<button id="load" onclick="submit()">Load</button>',
    '</div>',
    '<script>',
    'function submit(){',
    'var t=document.getElementById("csv").value;',
    'if(!t||!t.trim()){document.getElementById("status").textContent="Paste the CSV first.";return;}',
    'document.getElementById("load").disabled=true;',
    'document.getElementById("status").textContent="Loading...";',
    'google.script.run',
    '.withSuccessHandler(function(msg){document.getElementById("status").textContent=msg;document.getElementById("load").disabled=false;})',
    '.withFailureHandler(function(err){document.getElementById("status").textContent=String(err&&err.message?err.message:err);document.getElementById("load").disabled=false;})',
    '.applyPastedSendQueue(t);',
    '}',
    '</script></body></html>'
  ].join('\n');
}

function updateSummaryFromQueue_() {
  var queue = readQueue_();
  var summary = SpreadsheetApp.getActive().getSheetByName(TAB.SUMMARY);
  if (!summary || queue.rows.length === 0) {
    return;
  }
  var first = queue.rows[0];
  var loadedAt = new Date().toISOString();
  setSummary_(summary, 'delivery_batch_code', first.delivery_batch_code);
  setSummary_(summary, 'event_code', first.event_code);
  setSummary_(summary, 'delivery_mode', first.delivery_mode);
  setSummary_(summary, 'prepared_count', queue.rows.length);
  setSummary_(summary, 'loaded_at', loadedAt);
  // Protected active-batch identity, populated from the loaded queue (never
  // typed by hand). Every send and export reads these.
  setSummary_(summary, ACTIVE_BATCH_FIELDS.CODE, first.delivery_batch_code);
  setSummary_(summary, ACTIVE_BATCH_FIELDS.MODE, String(first.delivery_mode).toLowerCase());
  setSummary_(summary, ACTIVE_BATCH_FIELDS.EVENT, first.event_code);
  setSummary_(summary, ACTIVE_BATCH_FIELDS.LOADED_AT, loadedAt);
}

function setSummary_(sheet, field, value) {
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === field) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([field, value]);
}

/** Reads the Send Queue tab into an indexed structure. */
function readQueue_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(TAB.QUEUE);
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var index = {};
  for (var c = 0; c < header.length; c++) {
    index[String(header[c]).trim()] = c;
  }
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    if (String(raw[index.delivery_reference]).trim() === '') {
      continue;
    }
    var row = {};
    for (var key in index) {
      row[key] = String(raw[index[key]] === undefined ? '' : raw[index[key]]);
    }
    row.__rowNumber = r + 1;
    rows.push(row);
  }
  return { header: header, index: index, rows: rows };
}

/** Menu action: structural validation with a summary alert. */
function validateBatch() {
  var config = readConfig_();
  assertConfigComplete_(config);
  var queue = readQueue_();
  var problems = [];
  var seenReferences = {};
  for (var i = 0; i < queue.rows.length; i++) {
    var row = queue.rows[i];
    if (!row.row_signature || row.row_signature.length < 20) {
      problems.push('Row ' + row.__rowNumber + ': missing row signature.');
    }
    if (!isEmail_(row.intended_recipient_email)) {
      problems.push('Row ' + row.__rowNumber + ': invalid intended recipient.');
    }
    if (!row.pdf_file_name) {
      problems.push('Row ' + row.__rowNumber + ': missing PDF file name.');
    }
    if (seenReferences[row.delivery_reference]) {
      problems.push('Row ' + row.__rowNumber + ': duplicate delivery reference.');
    }
    seenReferences[row.delivery_reference] = true;
  }
  writeConfig_('LAST_VALIDATED_AT', new Date().toISOString());
  var ui = SpreadsheetApp.getUi();
  if (problems.length === 0) {
    ui.alert('Batch validated: ' + queue.rows.length + ' rows look sendable.');
  } else {
    ui.alert('Validation found problems:\n\n' + problems.slice(0, 20).join('\n'));
  }
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}
