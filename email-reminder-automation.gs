/**
 * Email Reminder Automation
 *
 * Runs on a time-driven trigger and checks a Google Sheet
 * for records that require a reminder email.
 *
 * Main functions:
 * - Reviews reminder dates
 * - Sends personalized emails
 * - Prevents duplicate reminders
 * - Marks successfully processed records
 */

// ==================================================
// CONFIGURATION
// ==================================================

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

const EMAIL_COLUMN = 'Email address';
const NAME_COLUMN = 'Full name';
const EXPIRATION_DATE_COLUMN = 'Expiration date';
const REMINDER_DATE_COLUMN = 'Reminder date';
const REMINDER_SENT_COLUMN = 'Reminder sent';


// ==================================================
// REVIEW REMINDERS
// ==================================================

function reviewReminders() {

  const spreadsheet =
    SpreadsheetApp.openById(
      SPREADSHEET_ID
    );

  SpreadsheetApp.flush();

  const sheets =
    spreadsheet.getSheets();

  let sheet = null;
  let headers = null;


  // ==================================================
  // FIND SHEET WITH REQUIRED COLUMNS
  // ==================================================

  for (let i = 0; i < sheets.length; i++) {

    const lastColumn =
      sheets[i].getLastColumn();

    if (lastColumn === 0) {
      continue;
    }

    const currentHeaders =
      sheets[i]
        .getRange(
          1,
          1,
          1,
          lastColumn
        )
        .getValues()[0];

    const hasRequiredColumns =

      currentHeaders.indexOf(
        EMAIL_COLUMN
      ) !== -1 &&

      currentHeaders.indexOf(
        NAME_COLUMN
      ) !== -1 &&

      currentHeaders.indexOf(
        EXPIRATION_DATE_COLUMN
      ) !== -1 &&

      currentHeaders.indexOf(
        REMINDER_DATE_COLUMN
      ) !== -1 &&

      currentHeaders.indexOf(
        REMINDER_SENT_COLUMN
      ) !== -1;


    if (hasRequiredColumns) {

      sheet = sheets[i];
      headers = currentHeaders;

      break;

    }

  }


  if (!sheet) {

    throw new Error(
      'No sheet containing all required columns was found.'
    );

  }


  // ==================================================
  // IDENTIFY COLUMN POSITIONS
  // ==================================================

  const emailColumn =
    headers.indexOf(
      EMAIL_COLUMN
    );

  const nameColumn =
    headers.indexOf(
      NAME_COLUMN
    );

  const expirationDateColumn =
    headers.indexOf(
      EXPIRATION_DATE_COLUMN
    );

  const reminderDateColumn =
    headers.indexOf(
      REMINDER_DATE_COLUMN
    );

  const reminderSentColumn =
    headers.indexOf(
      REMINDER_SENT_COLUMN
    );


  // ==================================================
  // GET DATA
  // ==================================================

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        sheet.getLastColumn()
      )
      .getValues();


  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );


  // ==================================================
  // REVIEW EACH RECORD
  // ==================================================

  for (let i = 0; i < data.length; i++) {

    const row =
      data[i];

    const email =
      String(
        row[emailColumn] || ''
      ).trim();

    const name =
      String(
        row[nameColumn] || ''
      ).trim();

    const expirationDate =
      row[expirationDateColumn];

    const reminderDate =
      row[reminderDateColumn];

    const reminderSent =
      String(
        row[reminderSentColumn] || ''
      )
        .trim()
        .toLowerCase();


    // Skip records already processed

    if (
      reminderSent === 'yes'
    ) {
      continue;
    }


    // Skip records without email

    if (!email) {
      continue;
    }


    // Validate reminder date

    if (
      !(reminderDate instanceof Date) ||
      isNaN(
        reminderDate.getTime()
      )
    ) {
      continue;
    }


    // Validate expiration date

    if (
      !(expirationDate instanceof Date) ||
      isNaN(
        expirationDate.getTime()
      )
    ) {
      continue;
    }


    const comparisonDate =
      new Date(
        reminderDate
      );

    comparisonDate.setHours(
      0,
      0,
      0,
      0
    );


    // ==================================================
    // SEND EMAIL WHEN REMINDER DATE IS DUE
    // ==================================================

    if (
      comparisonDate.getTime() <=
      today.getTime()
    ) {

      const formattedExpirationDate =
        Utilities.formatDate(
          expirationDate,
          spreadsheet.getSpreadsheetTimeZone(),
          'dd/MM/yyyy'
        );


      sendReminderEmail(
        email,
        name,
        formattedExpirationDate
      );


      // Mark as successfully sent

      sheet
        .getRange(
          i + 2,
          reminderSentColumn + 1
        )
        .setValue(
          'Yes'
        );

    }

  }

}


// ==================================================
// SEND REMINDER EMAIL
// ==================================================

function sendReminderEmail(
  email,
  name,
  expirationDate
) {

  const subject =
    'Expiration Reminder';


  const plainTextMessage =

    'Hello ' + name + ',\n\n' +

    'This is a reminder that an upcoming expiration date is approaching: ' +
    expirationDate + '.\n\n' +

    'We recommend starting the renewal process in advance.\n\n' +

    'For additional information, please contact the medical practice.\n\n' +

    'Best regards,\n' +

    'Medical Practice';


  const htmlMessage =

    '<div style="' +
    'font-family: Tahoma, Arial, sans-serif;' +
    'font-size: 14px;' +
    '">' +

      '<p>Hello <strong>' +
      escapeHtml(name) +
      '</strong>,</p>' +

      '<p>This is a reminder that an upcoming expiration date is approaching: ' +

      '<strong>' +
      expirationDate +
      '</strong>.</p>' +

      '<p>We recommend starting the renewal process in advance.</p>' +

      '<p>For additional information, please contact the medical practice.</p>' +

      '<p>Best regards,<br>' +

      '<strong>Medical Practice</strong></p>' +

    '</div>';


  MailApp.sendEmail({

    to: email,

    subject: subject,

    body: plainTextMessage,

    htmlBody: htmlMessage

  });

}


// ==================================================
// ESCAPE HTML
// ==================================================

function escapeHtml(
  text
) {

  return String(
    text || ''
  )

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /'/g,
      '&#039;'
    );

}


// ==================================================
// CREATE DAILY TRIGGER
// ==================================================

function createReminderTrigger() {

  const triggers =
    ScriptApp.getProjectTriggers();


  triggers.forEach(
    function(trigger) {

      if (
        trigger.getHandlerFunction() ===
        'reviewReminders'
      ) {

        ScriptApp.deleteTrigger(
          trigger
        );

      }

    }
  );


  ScriptApp
    .newTrigger(
      'reviewReminders'
    )
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

}
