/**
 * Sending engine.
 *
 * Uses MailApp (never GmailApp) so the basic sender needs no inbox-reading
 * permission. Every send is one individual email to one graduate: CC and BCC
 * are never used. A LockService lock serializes runs so two executions cannot
 * send the same rows. Each row is marked SENDING and flushed before the send,
 * then SENT or FAILED immediately after, so a crash never double-sends and a
 * completed row is always recorded.
 */

/** Returns the executing Workspace account. */
function effectiveSender_() {
  return Session.getEffectiveUser().getEmail();
}

/**
 * Confirms the effective account is allowed to send. Production sending
 * requires the exact authorized sender; internal test execution is allowed
 * only when TEST_MODE is on. If the authorized address is a Gmail alias, the
 * caller must configure it as an approved sendAs alias — the script never
 * pretends the message came from an address Google does not authorize.
 */
function assertSenderAllowed_(config, isProduction) {
  var effective = String(effectiveSender_()).toLowerCase();
  var authorized = String(config.AUTHORIZED_SENDER_EMAIL).toLowerCase();
  if (isProduction) {
    if (effective !== authorized) {
      throw new Error(
        'Production sending requires ' + config.AUTHORIZED_SENDER_EMAIL +
        '. The current account is ' + effective + '.'
      );
    }
  }
  return effective;
}

/**
 * CHECKIN-10A: production sending is unlocked by typing the EXACT active
 * batch code into PRODUCTION_CONFIRMATION. The code must be read off the
 * batch actually loaded, so the confirmation cannot become a reflex.
 */
function assertProductionUnlocked_(config, activeBatchCode) {
  var decision = productionConfirmationDecision_(
    config.PRODUCTION_CONFIRMATION,
    activeBatchCode
  );
  if (!decision.allowed) {
    throw new Error(decision.message);
  }
}

/** Clears the production confirmation so it must be re-entered each run. */
function clearProductionConfirmation_() {
  writeConfig_('PRODUCTION_CONFIRMATION', '');
}

function findPdfBlob_(config, fileName) {
  var folderId = String(config.DRIVE_BATCH_FOLDER_ID).trim();
  if (folderId.length === 0) {
    throw new Error('DRIVE_BATCH_FOLDER_ID is not configured.');
  }
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFilesByName(fileName);
  if (!files.hasNext()) {
    return null;
  }
  var file = files.next();
  if (file.getMimeType() !== 'application/pdf') {
    throw new Error('File is not a PDF: ' + fileName);
  }
  return file.getBlob();
}

function sha256Hex_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var out = '';
  for (var i = 0; i < digest.length; i++) {
    var b = (digest[i] < 0 ? digest[i] + 256 : digest[i]).toString(16);
    out += b.length === 1 ? '0' + b : b;
  }
  return out;
}

/**
 * Pure guard: a row may only be sent when it belongs to the active batch and
 * active mode. Empty active values (an unloaded sheet) match nothing is
 * enforced by the caller; here an empty expectation is treated as "no active
 * batch" and the row is refused so a send can never run without an active
 * batch identity.
 */
function rowMatchesActiveBatch_(row, activeBatchCode, activeMode) {
  var wantBatch = String(activeBatchCode === undefined ? '' : activeBatchCode).trim();
  var wantMode = String(activeMode === undefined ? '' : activeMode).trim().toLowerCase();
  if (wantBatch === '' || wantMode === '') {
    return false;
  }
  var code = String(row.delivery_batch_code === undefined ? '' : row.delivery_batch_code).trim();
  var mode = String(row.delivery_mode === undefined ? '' : row.delivery_mode).trim().toLowerCase();
  return code === wantBatch && mode === wantMode;
}

/**
 * Pure: the effective ceiling for one run. The configured cap (already hard-
 * limited to PRODUCTION_NORMAL_RUN_SIZE) may only be lowered by an explicit
 * run limit, never raised — so the pilot is always at most five and a normal
 * run is always at most twenty-five.
 */
function runCap_(config, limit) {
  var cap = maxPerRun_(config);
  var requested = parseInt(limit, 10);
  if (isNaN(requested) || requested <= 0) {
    return cap;
  }
  return Math.min(cap, requested);
}

/** Core row loop shared by Send Selected, Send Next 25 and Resume Failed. */
function sendRows_(rowNumbers, options) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Another send is already running. Try again shortly.');
    return;
  }
  try {
    var config = readConfig_();
    // assertConfigComplete_ also asserts WORKBOOK_MODE and TEST_MODE agree.
    assertConfigComplete_(config);
    var testMode = isTestMode_(config);
    var isProduction = !testMode;

    // Active-batch identity is populated from the loaded signed queue. Every
    // send uses only these values, so a run can only ever touch one batch.
    var summary = SpreadsheetApp.getActive().getSheetByName(TAB.SUMMARY);
    var activeBatchCode = String(getSummary_(summary, ACTIVE_BATCH_FIELDS.CODE)).trim();
    var activeMode = String(getSummary_(summary, ACTIVE_BATCH_FIELDS.MODE)).trim().toLowerCase();
    var activeEventCode = String(getSummary_(summary, ACTIVE_BATCH_FIELDS.EVENT)).trim();
    if (activeBatchCode === '' || activeMode === '') {
      SpreadsheetApp.getUi().alert(
        'No active batch is loaded. Load a signed send queue before sending.'
      );
      return;
    }

    // CHECKIN-10A: the workbook's own identity is checked against the loaded
    // queue on every send, not only at load time. A queue that somehow ended
    // up in the wrong workbook still cannot be sent from it.
    var queueGate = queueModeAllowedInWorkbook_(workbookMode_(config), activeMode);
    if (!queueGate.allowed) {
      SpreadsheetApp.getUi().alert(queueGate.message);
      return;
    }
    var eventGate = eventAllowedInWorkbook_(workbookMode_(config), activeEventCode);
    if (!eventGate.allowed) {
      SpreadsheetApp.getUi().alert(eventGate.message);
      return;
    }

    var runMode = testMode ? 'test' : 'production';
    if (activeMode !== runMode) {
      SpreadsheetApp.getUi().alert(
        'Active batch mode (' + activeMode + ') does not match TEST_MODE. Set ' +
        'TEST_MODE to ' + (activeMode === 'test' ? 'TRUE' : 'FALSE') +
        ' to match the active batch before sending.'
      );
      return;
    }

    // CHECKIN-10A: the exact active batch code must have been typed into
    // PRODUCTION_CONFIRMATION. Checked after the batch is known, because the
    // batch code IS the confirmation.
    if (isProduction) {
      assertProductionUnlocked_(config, activeBatchCode);
    }
    var sender = assertSenderAllowed_(config, isProduction);

    // CHECKIN-10A result checkpoint: refuse to pile a new run on top of
    // attempts the application has never seen.
    var waiting = unexportedAttemptsForActiveBatch_(activeBatchCode, activeMode);
    if (waiting > 0) {
      var proceed = SpreadsheetApp.getUi().alert(
        'Results waiting to be exported',
        waiting + ' attempt(s) for batch ' + activeBatchCode + ' have not been ' +
        'exported yet, so the application does not know about them. Export New ' +
        'Results for Active Batch and import them before sending again.\n\n' +
        'Continue anyway?',
        SpreadsheetApp.getUi().ButtonSet.YES_NO
      );
      if (proceed !== SpreadsheetApp.getUi().Button.YES) {
        return;
      }
    }

    var sheet = SpreadsheetApp.getActive().getSheetByName(TAB.QUEUE);
    var queue = readQueue_();
    var rowsByNumber = {};
    for (var q = 0; q < queue.rows.length; q++) {
      rowsByNumber[queue.rows[q].__rowNumber] = queue.rows[q];
    }
    // The configured ceiling, further reduced by an explicit run limit such as
    // the five-recipient pilot. A run limit can only ever lower the cap.
    var perRunCap = runCap_(config, options.limit);
    var sent = 0;
    var startTime = new Date().getTime();

    for (var i = 0; i < rowNumbers.length && sent < perRunCap; i++) {
      // Stop cleanly if execution time is running out, leaving rows READY.
      if (new Date().getTime() - startTime > 300000) {
        break;
      }
      var row = rowsByNumber[rowNumbers[i]];
      if (!row) {
        continue;
      }
      // Reject any row that is not the active batch and mode.
      if (!rowMatchesActiveBatch_(row, activeBatchCode, activeMode)) {
        continue;
      }
      var status = String(row.status).toUpperCase();
      var sendable = options.allowFailedRetry
        ? (status === 'READY' || status === 'FAILED')
        : (status === 'READY');
      if (!sendable) {
        continue;
      }

      var quota = MailApp.getRemainingDailyQuota();
      if (quota <= 0) {
        SpreadsheetApp.getUi().alert('Daily email quota exhausted. Stopping.');
        break;
      }

      setStatus_(sheet, row, 'SENDING');
      SpreadsheetApp.flush();

      var result = sendOneRow_(config, row, testMode, sender);
      appendLog_(result);
      setStatus_(sheet, row, result.outcome === 'sent' || result.outcome === 'test_sent'
        ? (testMode ? 'TEST_SENT' : 'SENT')
        : 'FAILED');
      incrementAttempt_(sheet, row);
      SpreadsheetApp.flush();
      sent += 1;
    }

    if (isProduction) {
      clearProductionConfirmation_();
    }
    SpreadsheetApp.getUi().alert('Run complete. Processed ' + sent + ' row(s).');
  } finally {
    lock.releaseLock();
  }
}

/** Sends exactly one email and returns a log record. Never CC/BCC. */
function sendOneRow_(config, row, testMode, sender) {
  var attemptReference = 'AT-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  var attemptedAt = new Date().toISOString();
  var record = {
    attempt_reference: attemptReference,
    delivery_reference: row.delivery_reference,
    row_signature: row.row_signature,
    attempt_number: parseInt(row.attempt_count || '0', 10) + 1,
    intended_recipient_email: row.intended_recipient_email,
    actual_recipient_email: '',
    delivery_mode: testMode ? 'test' : 'production',
    outcome: 'failed',
    attempted_at: attemptedAt,
    sent_by: sender,
    pdf_file_name: row.pdf_file_name,
    pdf_sha256: row.pdf_sha256,
    error_code: '',
    error_message: '',
    bounce_detected_at: '',
    // The true batch this attempt belongs to. Recording it per row is what
    // lets the result export be scoped strictly to the active batch.
    delivery_batch_code: row.delivery_batch_code
  };

  try {
    var blob = findPdfBlob_(config, row.pdf_file_name);
    if (!blob) {
      record.error_code = 'pdf_not_found';
      record.error_message = 'PDF not found in the configured Drive folder.';
      return record;
    }
    if (row.pdf_sha256 && sha256Hex_(blob.getBytes()) !== String(row.pdf_sha256).toLowerCase()) {
      record.error_code = 'pdf_checksum_mismatch';
      record.error_message = 'The Drive PDF checksum does not match the queue.';
      return record;
    }

    var recipient = testMode ? config.TEST_RECIPIENT_EMAIL : row.intended_recipient_email;
    record.actual_recipient_email = recipient;

    var subject = subjectFor_(config, row.delivery_purpose, testMode);
    var html = buildEmailHtml_(row, testMode);

    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      htmlBody: html,
      replyTo: config.REPLY_TO_EMAIL,
      name: config.SENDER_DISPLAY_NAME,
      attachments: [blob.setName(row.pdf_file_name)]
    });

    record.outcome = testMode ? 'test_sent' : 'sent';
    return record;
  } catch (err) {
    record.error_code = 'send_exception';
    record.error_message = String(err && err.message ? err.message : err).slice(0, 400);
    return record;
  }
}

function subjectFor_(config, purpose, testMode) {
  var subject;
  if (purpose === 'updated') {
    subject = config.EMAIL_SUBJECT_UPDATED;
  } else if (purpose === 'replacement') {
    subject = config.EMAIL_SUBJECT_REPLACEMENT;
  } else {
    subject = config.EMAIL_SUBJECT_INITIAL;
  }
  return testMode ? '[TEST] ' + subject : subject;
}

function setStatus_(sheet, row, status) {
  var col = row.__statusCol || columnFor_(sheet, 'status');
  sheet.getRange(row.__rowNumber, col).setValue(status);
  row.status = status;
}

function incrementAttempt_(sheet, row) {
  var col = columnFor_(sheet, 'attempt_count');
  var next = parseInt(row.attempt_count || '0', 10) + 1;
  sheet.getRange(row.__rowNumber, col).setValue(next);
  row.attempt_count = String(next);
}

function columnFor_(sheet, name) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var c = 0; c < header.length; c++) {
    if (String(header[c]).trim() === name) {
      return c + 1;
    }
  }
  throw new Error('Column not found: ' + name);
}

function appendLog_(record) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(TAB.LOG);
  // Append-only. Columns follow LOG_HEADERS; export tracking columns start
  // blank and are filled only when a created Drive export includes the row.
  sheet.appendRow([
    record.attempt_reference,
    record.delivery_reference,
    record.row_signature,
    record.attempt_number,
    record.intended_recipient_email,
    record.actual_recipient_email,
    record.delivery_mode,
    record.outcome,
    record.attempted_at,
    record.sent_by,
    record.pdf_file_name,
    record.pdf_sha256,
    record.error_code,
    record.error_message,
    record.bounce_detected_at,
    record.delivery_batch_code,
    '', // export_status
    '', // exported_at
    '', // export_file_name
    ''  // export_run_reference
  ]);
}

// ---- Menu actions -----------------------------------------------------

function sendSelected() {
  var selection = SpreadsheetApp.getActive().getActiveRange();
  var numbers = [];
  for (var r = 0; r < selection.getNumRows(); r++) {
    numbers.push(selection.getRow() + r);
  }
  sendRows_(numbers, { allowFailedRetry: false });
}

/**
 * Pure: the READY row numbers, in sheet order. A row that is already SENT,
 * TEST_SENT or SENDING is never returned, which is what makes an interrupted
 * run resume on the remaining rows only and never re-send a successful one.
 */
function readyRowNumbers_(rows) {
  var numbers = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].status).toUpperCase() === 'READY') {
      numbers.push(rows[i].__rowNumber);
    }
  }
  return numbers;
}

function sendNext25() {
  var queue = readQueue_();
  sendRows_(readyRowNumbers_(queue.rows), {
    allowFailedRetry: false,
    limit: PRODUCTION_NORMAL_RUN_SIZE
  });
}

/**
 * CHECKIN-10A five-recipient production pilot.
 *
 * Sends at most PRODUCTION_PILOT_RUN_SIZE prepared rows and then stops. There
 * is no automatic continuation: the administrator must export and import the
 * results and verify them before any larger run. If fewer than five rows
 * remain, it sends only those.
 */
function sendProductionPilot() {
  var queue = readQueue_();
  var numbers = readyRowNumbers_(queue.rows).slice(0, PRODUCTION_PILOT_RUN_SIZE);
  if (numbers.length === 0) {
    SpreadsheetApp.getUi().alert('No prepared rows remain in the active batch.');
    return;
  }
  sendRows_(numbers, {
    allowFailedRetry: false,
    limit: PRODUCTION_PILOT_RUN_SIZE
  });
}

function resumeFailed() {
  var queue = readQueue_();
  var numbers = [];
  for (var i = 0; i < queue.rows.length; i++) {
    if (String(queue.rows[i].status).toUpperCase() === 'FAILED') {
      numbers.push(queue.rows[i].__rowNumber);
    }
  }
  sendRows_(numbers, { allowFailedRetry: true, limit: PRODUCTION_NORMAL_RUN_SIZE });
}

/** Test send for the selected row. Only ever goes to TEST_RECIPIENT_EMAIL. */
function sendTestForSelectedRow() {
  var config = readConfig_();
  assertConfigComplete_(config);
  if (!isTestMode_(config)) {
    SpreadsheetApp.getUi().alert('Send Test requires TEST_MODE to be TRUE.');
    return;
  }
  var selection = SpreadsheetApp.getActive().getActiveRange();
  sendRows_([selection.getRow()], { allowFailedRetry: true });
}

function showRemainingQuota() {
  SpreadsheetApp.getUi().alert(
    'Remaining daily email quota: ' + MailApp.getRemainingDailyQuota()
  );
}
