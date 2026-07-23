/**
 * CHECKIN-10A administrator runbook content.
 *
 * Kept out of the page file so the section list is a plain data module the
 * tests can assert against. It contains no secret, no token and no graduate
 * data, and nothing here performs an action.
 */

import {
  PRODUCTION_NORMAL_RUN_SIZE,
  PRODUCTION_PILOT_RUN_SIZE,
  PRODUCTION_EVENT_CODE,
  DEV_EVENT_CODE,
  RESEND_VS_REPLACEMENT_TEXT,
} from "./constants";

export interface Section {
  title: string;
  intro?: string;
  steps: string[];
  warning?: string;
}

export const RUNBOOK_SECTIONS: Section[] = [
  {
    title: "Test workbook setup",
    intro:
      "The test workbook is the only place you may practise. It can never send a message to a graduate.",
    steps: [
      "Create a Google Sheet named “Toronto Academy Graduation Tickets - TEST”.",
      "Open Extensions → Apps Script and paste every script file from google-apps-script/graduation-ticket-sender.",
      "Reload the sheet, then choose Graduation Tickets → Setup Workbook.",
      "On the Configuration tab set WORKBOOK_MODE to TEST.",
      "Set TEST_MODE to TRUE.",
      "Set TEST_RECIPIENT_EMAIL to an internal administrator inbox. Never a graduate address.",
      "Set MAX_PER_RUN to 1 so a mistake can only ever affect one row.",
      "Leave PRODUCTION_CONFIRMATION blank.",
      "Confirm the yellow banner reads: TEST WORKBOOK — all messages are redirected to the internal test recipient.",
    ],
    warning:
      "If the banner does not say TEST WORKBOOK, stop and re-check WORKBOOK_MODE before doing anything else.",
  },
  {
    title: "Production workbook setup",
    intro:
      "This is a separate Google Sheet. Never reuse the test workbook for production.",
    steps: [
      "Create a second Google Sheet named “Toronto Academy Convocation 2026 - PRODUCTION DISTRIBUTION”.",
      "The workbook must be owned by office@torontoacademy.ca and shared only with authorized administrators.",
      "Paste the same script files, reload, then choose Graduation Tickets → Setup Workbook.",
      "Set WORKBOOK_MODE to PRODUCTION.",
      "Set TEST_MODE to FALSE.",
      "Leave TEST_RECIPIENT_EMAIL blank.",
      `Set MAX_PER_RUN to ${PRODUCTION_NORMAL_RUN_SIZE}.`,
      "Set AUTHORIZED_SENDER_EMAIL and REPLY_TO_EMAIL to office@torontoacademy.ca.",
      "Confirm the banner reads: PRODUCTION WORKBOOK — messages are delivered to graduate email addresses.",
    ],
    warning:
      "The production workbook refuses to load a test queue, and the test workbook refuses to load a production queue. If a load is refused, you have opened the wrong workbook.",
  },
  {
    title: "Creating the production event",
    intro:
      "The production event is created once, by a developer running a local script. It is not created from this website.",
    steps: [
      `The production event code is ${PRODUCTION_EVENT_CODE} — “Convocation Ceremony 2026”, Sunday 26 July 2026, 12:00 PM to 4:00 PM, America/Toronto, at Mississauga Grand Banquet & Event Centre, 35 Brunel Road, Mississauga, ON L4Z 3E8.`,
      "Ask the developer to run: npm run events:create-production -- --dry-run. This only reports; it writes nothing.",
      "When the report looks right, ask them to run: npm run events:create-production.",
      "Ask them to confirm with: npm run events:verify-production. It prints a summary and no secrets.",
      "Running the create script a second time makes no further change; it is safe to re-run.",
      "The event is created with status “draft”. It stays draft until you are ready.",
      `The test event ${DEV_EVENT_CODE} is never changed by this script and never becomes the production event.`,
    ],
    warning:
      "The script never copies practice registrations, never creates tickets and never sends email.",
  },
  {
    title: "Importing registrations",
    intro: "Real graduate records enter the system only here.",
    steps: [
      "Go to Admin → Registrations → Import.",
      "Upload the approved registration workbook.",
      "Review the comparison screen before applying. Nothing is written until you apply.",
      "Apply the import, then confirm the imported count matches the workbook.",
    ],
  },
  {
    title: "Registration reconciliation",
    steps: [
      "Compare the imported total against the registrar's list.",
      "Correct spelling and email errors in the source workbook and re-import rather than editing by hand.",
      "Confirm every graduate who should receive a ticket has a valid email address.",
      "Anyone with a missing or invalid email will appear under “Invalid or missing email” in the eligibility preview.",
    ],
  },
  {
    title: "Generating PDFs",
    steps: [
      "Go to Admin → Tickets → Documents and generate the branded PDF batch.",
      "Wait until the batch status is complete.",
      "Upload the generated PDFs to the Drive folder used by the production workbook.",
      "Put that folder's id into DRIVE_BATCH_FOLDER_ID on the Configuration tab.",
    ],
    warning:
      "Each PDF has a checksum. If a file is edited or replaced after generation, the send is refused for that row.",
  },
  {
    title: "Internal test workflow",
    intro: "Always rehearse in the test workbook before touching production.",
    steps: [
      "In the application, prepare a batch with mode “test”.",
      "Export the sending package and load it into the TEST workbook.",
      "Run Validate Batch.",
      "Use Send Test for Selected Row and confirm the message arrives at the internal test recipient.",
      "Export the results and import them back into the application.",
      "Confirm the test counters moved and the production counters did not.",
    ],
  },
  {
    title: "Preparing the production batch",
    steps: [
      "Confirm the banner at the top of the page reads PRODUCTION and PRODUCTION EVENT.",
      "Open Production controls and read the eligibility preview first.",
      "Choose the batch type: initial, selected resend, failed-delivery retry, or replacement.",
      "For a resend or replacement you must type a reason. It is stored in the audit history.",
      "Prepare the batch, then export the sending package and load it into the PRODUCTION workbook.",
      "Run Validate Batch in the workbook and confirm it reports no errors.",
    ],
    warning:
      "Production preparation is refused on a developer laptop and on any preview link. It works only on the live site with the production event active.",
  },
  {
    title: `${PRODUCTION_PILOT_RUN_SIZE}-recipient pilot`,
    intro:
      "The first real send is always a pilot. If something is wrong, it is wrong for five people, not two hundred.",
    steps: [
      `Choose Graduation Tickets → Send ${PRODUCTION_PILOT_RUN_SIZE}-Recipient Production Pilot.`,
      "Type the exact active batch code when prompted. Copy it from the Batch Summary tab.",
      `At most ${PRODUCTION_PILOT_RUN_SIZE} messages are sent. The run does not continue on its own.`,
      "Contact those graduates, or check the reply-to inbox, to confirm the ticket arrived and the PDF opens.",
      "Export the results and import them into the application before doing anything else.",
    ],
    warning:
      "Do not run a full send until the pilot results have been imported and verified.",
  },
  {
    title: `Sending the next ${PRODUCTION_NORMAL_RUN_SIZE}`,
    steps: [
      `Choose Graduation Tickets → Send Next ${PRODUCTION_NORMAL_RUN_SIZE}.`,
      "Type the exact active batch code when prompted.",
      `At most ${PRODUCTION_NORMAL_RUN_SIZE} messages are sent in one run.`,
      "Each graduate receives one personalised message with one PDF attached. There is never a CC or BCC.",
      "Every row is written back to the sheet the moment its send succeeds or fails.",
      "Export and import the results, then repeat until no prepared rows remain.",
    ],
    warning:
      "The confirmation is cleared after every run, so you must type the batch code again for the next one.",
  },
  {
    title: "Exporting and importing results",
    intro: "Do this after every single run. It is the checkpoint.",
    steps: [
      "In the workbook choose Export New Results for Active Batch.",
      "Download the created file from Drive.",
      "In the application go to Import results and upload it.",
      "Check the counts on the production progress panel: sent, failed, remaining prepared.",
      "Only then start the next run.",
    ],
    warning:
      "If the progress panel shows attempts waiting for import, finish the import before sending again. Sending on top of unimported results makes the counts untrustworthy.",
  },
  {
    title: "Interrupted-run recovery",
    intro:
      "If your browser closes, the laptop sleeps or Apps Script times out mid-run, nothing is lost.",
    steps: [
      `Example: a ${PRODUCTION_NORMAL_RUN_SIZE}-row run stops after 17 sends.`,
      "Those 17 rows are already marked SENT in the sheet and already have a Send Log row.",
      "The remaining 8 rows are still READY.",
      "Simply run the send again. It picks up only the 8 remaining rows.",
      "No graduate is emailed twice, because a successful row is never re-sent automatically.",
    ],
    warning:
      "Never clear or retype the status column by hand to “fix” an interrupted run. That is what causes double sends.",
  },
  {
    title: "Failed-delivery retry",
    steps: [
      "Import the results so failures are visible in the application.",
      "Open Production controls and review the failed rows and the reason for each.",
      "Correct genuine problems first, such as a mistyped email address.",
      "Prepare a failed-delivery retry batch, then use Resume Failed in the workbook.",
      "A row that keeps failing for the same reason needs a person to look at it, not another retry.",
    ],
  },
  {
    title: "Resend versus replacement",
    intro: RESEND_VS_REPLACEMENT_TEXT,
    steps: [
      "Choose RESEND when the ticket itself is still correct: the graduate deleted the email, never received it, or the address was corrected.",
      "A resend keeps the same ticket and the same QR code. The graduate may use either copy.",
      "Choose REPLACEMENT when the ticket must change: the party size changed, the ticket was shared or compromised, or it was revoked.",
      "A replacement creates a new ticket and the old QR code stops being admissible at the door.",
      "Both require a written reason, which stays in the audit history.",
    ],
    warning:
      "If you are unsure, ask: does the old QR code still need to work? Yes means resend. No means replacement.",
  },
  {
    title: "Recording a prior external delivery",
    intro:
      "Use this when a graduate already got their ticket some other way — forwarded by hand, or sent from an office inbox before this system existed.",
    steps: [
      "Open Production controls → Record previous external delivery.",
      "Choose the graduate, the date it was sent, and how it was sent.",
      "Add a note explaining the circumstances.",
      "Save the record.",
    ],
    warning:
      "This records history only. It does not send anything, and the system will never claim it sent that email. The graduate is removed from the initial batch, and you can still send them a deliberate resend later.",
  },
  {
    title: "Bounce review",
    steps: [
      "In the workbook choose Scan Bounce Messages.",
      "Review the Bounce Review tab for addresses that rejected the message.",
      "Correct the address in the source registration data and re-import it.",
      "Prepare a resend for the corrected graduate.",
      "Export and import the results so the bounce is reflected in the application.",
    ],
  },
  {
    title: "Completion checklist",
    steps: [
      "Remaining prepared is zero.",
      "Every failed row has been retried or has a written explanation.",
      "Every bounce has been reviewed.",
      "The last result export has been imported; nothing is waiting.",
      "Production sent plus previously sent externally covers every eligible graduate.",
      "The eligibility preview shows no unexplained rows.",
      "The event is moved out of draft only when all of the above are true.",
    ],
  },
  {
    title: "Emergency stop procedure",
    intro: "If anything looks wrong, stop first and investigate second.",
    steps: [
      "In the Apps Script editor press the stop button to end the running execution.",
      "On the Configuration tab set TEST_MODE to TRUE. No further message can reach a graduate.",
      "Clear PRODUCTION_CONFIRMATION so no run can start.",
      "In the application, cancel the open production batch so no further package can be exported.",
      "Export whatever results exist and import them, so the record of what was actually sent is accurate.",
      "Do not delete rows from the Send Log. It is the only record of what happened.",
      "Contact the developer with the batch code and the time the run stopped.",
    ],
    warning:
      "Stopping a run never un-sends a message that has already gone out. Its purpose is to stop the next one.",
  },
];
