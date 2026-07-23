/**
 * Configuration for the Graduation Ticket Sender.
 *
 * The Configuration tab of the bound Google Sheet is the single source of
 * truth for runtime settings. The script FAILS CLOSED: if a required setting
 * is missing or a production send is attempted without the exact confirmation
 * phrase and the authorized sender, sending is refused.
 *
 * This file contains no real graduate data and no secret. The distribution
 * row signatures live in the Send Queue and are verified by the app on
 * import, not here.
 */

var TAB = {
  CONFIG: 'Configuration',
  SUMMARY: 'Batch Summary',
  QUEUE: 'Send Queue',
  LOG: 'Send Log',
  BOUNCE: 'Bounce Review',
  ARCHIVE: 'Batch Archive'
};

/**
 * The Send Log columns, header-mapped everywhere they are read or written.
 * CHECKIN-09C appends five columns after bounce_detected_at:
 *   delivery_batch_code  the true batch each attempt belongs to. Recording it
 *                        per row is what lets a result export be scoped to the
 *                        active batch instead of stamping the summary batch
 *                        code onto every leftover row.
 *   export_status        'exported' once the row is in a created Drive file.
 *   exported_at          when it was exported.
 *   export_file_name     the file it was exported in.
 *   export_run_reference the export run that included it.
 * The first fifteen columns keep their historical positions so Bounce Review,
 * which reads them by index, is unaffected.
 */
var LOG_HEADERS = [
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
  'bounce_detected_at',
  'delivery_batch_code',
  'export_status',
  'exported_at',
  'export_file_name',
  'export_run_reference'
];

/**
 * Protected active-batch identity fields, populated from the loaded signed
 * queue (never typed by hand). Every send and every export reads these so a
 * run can only ever touch the one batch that is currently loaded.
 */
var ACTIVE_BATCH_FIELDS = {
  CODE: 'ACTIVE_BATCH_CODE',
  MODE: 'ACTIVE_BATCH_MODE',
  EVENT: 'ACTIVE_EVENT_CODE',
  LOADED_AT: 'ACTIVE_QUEUE_LOADED_AT'
};

var CONFIG_KEYS = [
  'WORKBOOK_MODE',
  'TEST_MODE',
  'AUTHORIZED_SENDER_EMAIL',
  'TEST_RECIPIENT_EMAIL',
  'DRIVE_BATCH_FOLDER_ID',
  'MAX_PER_RUN',
  'REPLY_TO_EMAIL',
  'SENDER_DISPLAY_NAME',
  'EMAIL_SUBJECT_INITIAL',
  'EMAIL_SUBJECT_UPDATED',
  'EMAIL_SUBJECT_REPLACEMENT',
  'PRODUCTION_CONFIRMATION',
  'LAST_VALIDATED_AT'
];

var CONFIG_DEFAULTS = {
  // CHECKIN-10A: a fresh workbook is always a TEST workbook. Becoming a
  // production workbook is a deliberate, manual edit, never a default.
  WORKBOOK_MODE: 'TEST',
  TEST_MODE: 'TRUE',
  AUTHORIZED_SENDER_EMAIL: 'office@torontoacademy.ca',
  TEST_RECIPIENT_EMAIL: '',
  DRIVE_BATCH_FOLDER_ID: '',
  MAX_PER_RUN: '25',
  REPLY_TO_EMAIL: 'office@torontoacademy.ca',
  SENDER_DISPLAY_NAME: 'Toronto Academy of Education',
  EMAIL_SUBJECT_INITIAL:
    'Your Toronto Academy Convocation Ceremony 2026 Admission Ticket',
  EMAIL_SUBJECT_UPDATED:
    'Updated Toronto Academy Convocation Ceremony 2026 Admission Ticket',
  EMAIL_SUBJECT_REPLACEMENT:
    'Replacement Toronto Academy Convocation Ceremony 2026 Admission Ticket',
  PRODUCTION_CONFIRMATION: '',
  LAST_VALIDATED_AT: ''
};

/**
 * CHECKIN-10A workbook modes.
 *
 * WORKBOOK_MODE is the identity of the whole spreadsheet, not of one run. A
 * TEST workbook can never send to a graduate and can never load a production
 * queue; a PRODUCTION workbook can never load a test queue. The two workbooks
 * are separate Google Sheets and neither can be turned into the other by
 * loading a different file.
 */
var WORKBOOK_MODES = { TEST: 'TEST', PRODUCTION: 'PRODUCTION' };

var WORKBOOK_BANNERS = {
  TEST: 'TEST WORKBOOK — all messages are redirected to the internal test recipient.',
  PRODUCTION: 'PRODUCTION WORKBOOK — messages are delivered to graduate email addresses.'
};

/** The event code a production workbook is allowed to send for. */
var PRODUCTION_EVENT_CODE = 'CONVOCATION-2026';

/** Safe production run sizes. The pilot is deliberately tiny. */
var PRODUCTION_PILOT_RUN_SIZE = 5;
var PRODUCTION_NORMAL_RUN_SIZE = 25;

/**
 * Reads WORKBOOK_MODE, failing closed to TEST. Any value that is not exactly
 * PRODUCTION is treated as TEST, so a typo can only ever make the workbook
 * safer, never more dangerous.
 */
function workbookMode_(config) {
  var value = String(config.WORKBOOK_MODE === undefined ? '' : config.WORKBOOK_MODE)
    .trim()
    .toUpperCase();
  return value === WORKBOOK_MODES.PRODUCTION
    ? WORKBOOK_MODES.PRODUCTION
    : WORKBOOK_MODES.TEST;
}

function isProductionWorkbook_(config) {
  return workbookMode_(config) === WORKBOOK_MODES.PRODUCTION;
}

/** The banner text for the current workbook mode. */
function workbookBanner_(config) {
  return WORKBOOK_BANNERS[workbookMode_(config)];
}

/**
 * WORKBOOK_MODE and TEST_MODE must agree. A production workbook running with
 * TEST_MODE on would silently redirect real tickets to an internal inbox; a
 * test workbook with TEST_MODE off would send to real graduates. Both are
 * refused.
 */
function assertWorkbookModeConsistent_(config) {
  var mode = workbookMode_(config);
  var testMode = isTestMode_(config);
  if (mode === WORKBOOK_MODES.PRODUCTION && testMode) {
    throw new Error(
      'WORKBOOK_MODE is PRODUCTION but TEST_MODE is TRUE. Set TEST_MODE to ' +
      'FALSE in the production workbook, or use the test workbook instead.'
    );
  }
  if (mode === WORKBOOK_MODES.TEST && !testMode) {
    throw new Error(
      'WORKBOOK_MODE is TEST but TEST_MODE is FALSE. A test workbook must ' +
      'never send to a graduate. Set TEST_MODE to TRUE.'
    );
  }
}

/**
 * Pure guard: may a queue of this delivery mode be loaded into a workbook of
 * this workbook mode? Each workbook rejects the other's queue. Returns
 * { allowed, message }.
 */
function queueModeAllowedInWorkbook_(workbookMode, queueMode) {
  var wb = String(workbookMode === undefined ? '' : workbookMode).trim().toUpperCase();
  var qm = String(queueMode === undefined ? '' : queueMode).trim().toLowerCase();
  if (wb !== WORKBOOK_MODES.PRODUCTION) {
    wb = WORKBOOK_MODES.TEST;
  }
  if (qm !== 'test' && qm !== 'production') {
    return {
      allowed: false,
      message:
        'The queue does not declare a recognised delivery mode ("' + qm +
        '"). Export a fresh send queue from the application.'
    };
  }
  if (wb === WORKBOOK_MODES.TEST && qm === 'production') {
    return {
      allowed: false,
      message:
        'This is the TEST workbook and the queue is a PRODUCTION queue. ' +
        'Production queues may only be loaded into the production workbook. ' +
        'Open "Toronto Academy Convocation 2026 - PRODUCTION DISTRIBUTION" instead.'
    };
  }
  if (wb === WORKBOOK_MODES.PRODUCTION && qm === 'test') {
    return {
      allowed: false,
      message:
        'This is the PRODUCTION workbook and the queue is a TEST queue. ' +
        'Test queues may only be loaded into the test workbook. ' +
        'Open "Toronto Academy Graduation Tickets - TEST" instead.'
    };
  }
  return { allowed: true, message: '' };
}

/**
 * Pure guard: a production workbook may only ever send for the production
 * event. Returns { allowed, message }.
 */
function eventAllowedInWorkbook_(workbookMode, eventCode) {
  var wb = String(workbookMode === undefined ? '' : workbookMode).trim().toUpperCase();
  if (wb !== WORKBOOK_MODES.PRODUCTION) {
    return { allowed: true, message: '' };
  }
  var code = String(eventCode === undefined ? '' : eventCode).trim();
  if (code !== PRODUCTION_EVENT_CODE) {
    return {
      allowed: false,
      message:
        'The production workbook only sends for ' + PRODUCTION_EVENT_CODE +
        '. The loaded queue is for "' + code + '".'
    };
  }
  return { allowed: true, message: '' };
}

/**
 * CHECKIN-10A: the production confirmation is the EXACT active batch code,
 * not a fixed phrase. A memorised phrase can be typed on autopilot; the batch
 * code has to be read off the Batch Summary tab of the batch actually loaded,
 * which is what makes it a real confirmation. Returns { allowed, message }.
 */
function productionConfirmationDecision_(confirmationValue, activeBatchCode) {
  var typed = String(confirmationValue === undefined ? '' : confirmationValue).trim();
  var expected = String(activeBatchCode === undefined ? '' : activeBatchCode).trim();
  if (expected === '') {
    return {
      allowed: false,
      message:
        'No active batch is loaded, so there is no batch code to confirm. ' +
        'Load a signed send queue first.'
    };
  }
  if (typed === '') {
    return {
      allowed: false,
      message:
        'Production sending is locked. Set PRODUCTION_CONFIRMATION to exactly ' +
        'the active batch code: ' + expected
    };
  }
  if (typed !== expected) {
    return {
      allowed: false,
      message:
        'PRODUCTION_CONFIRMATION does not match the active batch code. ' +
        'It must be exactly: ' + expected
    };
  }
  return { allowed: true, message: '' };
}

/** Reads all configuration into a plain object keyed by CONFIG_KEYS. */
function readConfig_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(TAB.CONFIG);
  if (!sheet) {
    throw new Error('Configuration tab is missing. Run Setup Workbook first.');
  }
  var values = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0]).trim();
    if (key.length > 0) {
      config[key] = String(values[i][1] === undefined ? '' : values[i][1]).trim();
    }
  }
  return config;
}

/** Writes one configuration value back to the Configuration tab. */
function writeConfig_(key, value) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(TAB.CONFIG);
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

/** Throws when any required configuration value is absent. Fails closed. */
function assertConfigComplete_(config) {
  var required = [
    'WORKBOOK_MODE',
    'TEST_MODE',
    'AUTHORIZED_SENDER_EMAIL',
    'REPLY_TO_EMAIL',
    'SENDER_DISPLAY_NAME',
    'MAX_PER_RUN'
  ];
  for (var i = 0; i < required.length; i++) {
    if (!config[required[i]] || config[required[i]].length === 0) {
      throw new Error('Required configuration missing: ' + required[i]);
    }
  }
  if (isTestMode_(config) && (!config.TEST_RECIPIENT_EMAIL ||
      config.TEST_RECIPIENT_EMAIL.length === 0)) {
    throw new Error('TEST_MODE is on but TEST_RECIPIENT_EMAIL is empty.');
  }
  // CHECKIN-10A: the workbook's declared identity and its sending mode must
  // agree before anything else is considered.
  assertWorkbookModeConsistent_(config);
}

function isTestMode_(config) {
  return String(config.TEST_MODE).toUpperCase() === 'TRUE';
}

/**
 * The per-run ceiling.
 *
 * CHECKIN-10A hard-caps a production run at PRODUCTION_NORMAL_RUN_SIZE. The
 * cap is applied in code rather than trusted from the Configuration tab, so
 * raising MAX_PER_RUN in the sheet can lower the ceiling but never raise it
 * above 25 for a production workbook. A test workbook is capped the same way;
 * its messages go to the internal test recipient regardless.
 */
function maxPerRun_(config) {
  var ceiling = PRODUCTION_NORMAL_RUN_SIZE;
  var value = parseInt(config.MAX_PER_RUN, 10);
  if (isNaN(value) || value <= 0) {
    return ceiling;
  }
  return Math.min(value, ceiling);
}
