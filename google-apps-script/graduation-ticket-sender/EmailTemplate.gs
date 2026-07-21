/**
 * HTML email template.
 *
 * The body carries only presentation data from the Send Queue row: it never
 * contains the raw QR token (the QR lives inside the attached PDF) and never
 * contains payment details. In test mode a clearly labelled diagnostic block
 * shows the intended graduate and intended recipient, and the whole message
 * is marked as a test.
 */

function escapeHtml_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function partyLine_(row) {
  var parts = [escapeHtml_(row.graduate_count) + ' graduate'];
  if (parseInt(row.adult_guest_count, 10) > 0) {
    parts.push(escapeHtml_(row.adult_guest_count) + ' adult guest(s)');
  }
  if (parseInt(row.child_0_4_count, 10) > 0) {
    parts.push(escapeHtml_(row.child_0_4_count) + ' child 0-4');
  }
  if (parseInt(row.child_5_10_count, 10) > 0) {
    parts.push(escapeHtml_(row.child_5_10_count) + ' child 5-10');
  }
  return parts.join(', ');
}

function buildEmailHtml_(row, testMode) {
  var testBanner = '';
  if (testMode) {
    testBanner =
      '<div style="background:#fff3cd;border:1px solid #d4a017;padding:12px;margin-bottom:16px;">' +
      '<strong>THIS IS A TEST MESSAGE.</strong> No real graduate has been emailed.<br>' +
      'Intended graduate: ' + escapeHtml_(row.graduate_name) + '<br>' +
      'Intended recipient: ' + escapeHtml_(row.intended_recipient_email) +
      '</div>';
  }

  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#0b1f3a;max-width:640px;">' +
    testBanner +
    '<h2 style="margin:0 0 4px;">Toronto Academy of Education</h2>' +
    '<h3 style="margin:0 0 16px;color:#1b3a6b;">Convocation Ceremony 2026</h3>' +
    '<p>Dear ' + escapeHtml_(row.graduate_name) + ',</p>' +
    '<p>Your admission ticket for Convocation Ceremony 2026 is attached as a PDF.</p>' +
    '<table style="border-collapse:collapse;margin:12px 0;">' +
    '<tr><td style="padding:4px 12px 4px 0;"><strong>Date</strong></td><td>Sunday, July 26, 2026</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;"><strong>Time</strong></td><td>12:00 PM to 4:00 PM</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;"><strong>Venue</strong></td><td>Mississauga Grand Banquet &amp; Event Centre</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;"><strong>Address</strong></td><td>35 Brunel Road, Mississauga, ON L4Z 3E8</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;"><strong>Ticket code</strong></td><td>' + escapeHtml_(row.ticket_code) + '</td></tr>' +
    '<tr><td style="padding:4px 12px 4px 0;"><strong>Registered party</strong></td><td>' + partyLine_(row) + '</td></tr>' +
    '</table>' +
    '<p>This single admission ticket covers the graduate and all registered guests shown on this ticket. No separate guest ticket is required.</p>' +
    '<p>Please save the attached PDF on your phone or bring a printed copy, and present the QR code at check-in.</p>' +
    '<p>If any details are incorrect, reply to <a href="mailto:office@torontoacademy.ca">office@torontoacademy.ca</a> and we will update your registration.</p>' +
    '<p>If you cannot find the ticket at the venue, our staff can locate your registration and admit you.</p>' +
    '<p>Warm regards,<br>Toronto Academy of Education</p>' +
    '</div>';
}
