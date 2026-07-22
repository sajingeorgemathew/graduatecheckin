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

/** The exact phrase required to unlock a production send. */
var PRODUCTION_CONFIRMATION_PHRASE = 'SEND CONVOCATION 2026 TICKETS';

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
}

function isTestMode_(config) {
  return String(config.TEST_MODE).toUpperCase() === 'TRUE';
}

function maxPerRun_(config) {
  var value = parseInt(config.MAX_PER_RUN, 10);
  if (isNaN(value) || value <= 0) {
    return 25;
  }
  return Math.min(value, 100);
}
