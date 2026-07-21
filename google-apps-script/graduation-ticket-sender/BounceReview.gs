/**
 * Optional bounce review.
 *
 * This is the ONLY function that uses GmailApp, because it must search the
 * inbox for delivery-failure notifications. It is never run automatically and
 * must be invoked deliberately from the authorized office account. It never
 * marks a message as delivered and never assumes that the absence of a bounce
 * means a message reached an inbox.
 *
 * A bounce is only classified automatically when it is unambiguous: the
 * recipient is extracted confidently, the message is newer than the send, and
 * the recipient matches a known sent row. Anything ambiguous is written to the
 * Bounce Review tab as NEEDS_REVIEW for a human to resolve.
 */

function scanBounceMessages() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    'Scan Bounce Messages',
    'This reads recent delivery-failure notifications from this Gmail account. ' +
    'Continue?',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) {
    return;
  }

  var sentByRecipient = sentRecipientsFromLog_();
  var threads = GmailApp.search(
    'from:mailer-daemon OR subject:"Delivery Status Notification" newer_than:7d'
  );
  var bounceSheet = SpreadsheetApp.getActive().getSheetByName(TAB.BOUNCE);
  var added = 0;

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var message = messages[m];
      var body = message.getPlainBody();
      var recipient = extractFailedRecipient_(body);
      var messageDate = message.getDate();

      var classification = 'NEEDS_REVIEW';
      var deliveryReference = '';
      if (recipient && sentByRecipient[recipient.toLowerCase()]) {
        var sentRow = sentByRecipient[recipient.toLowerCase()];
        if (messageDate.getTime() >= new Date(sentRow.attempted_at).getTime()) {
          classification = 'BOUNCE';
          deliveryReference = sentRow.delivery_reference;
        }
      }

      bounceSheet.appendRow([
        recipient || '',
        deliveryReference,
        classification,
        messageDate.toISOString(),
        message.getId(),
        classification === 'BOUNCE'
          ? 'Confident automatic classification.'
          : 'Recipient not confidently matched to a sent row.'
      ]);
      added += 1;
    }
  }

  ui.alert(
    'Bounce scan complete. Added ' + added + ' row(s) to Bounce Review. ' +
    'A send success never means inbox delivery, and no message is marked delivered.'
  );
}

/** Builds a recipient -> sent-log-row map from the Send Log. */
function sentRecipientsFromLog_() {
  var log = SpreadsheetApp.getActive().getSheetByName(TAB.LOG);
  var values = log.getDataRange().getValues();
  var map = {};
  for (var r = 1; r < values.length; r++) {
    var outcome = String(values[r][7]).toLowerCase();
    if (outcome === 'sent') {
      var recipient = String(values[r][5]).toLowerCase();
      map[recipient] = {
        delivery_reference: String(values[r][1]),
        attempted_at: String(values[r][8])
      };
    }
  }
  return map;
}

function extractFailedRecipient_(body) {
  var match = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0] : '';
}
