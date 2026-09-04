/**
 * Google Workflow Automation
 * 
 * Automates an administrative workflow for a medical practice.
 * Triggered when a Google Form is submitted.
 *
 * Main functions:
 * - Captures form responses
 * - Generates a document from a Google Docs template
 * - Calculates age and BMI
 * - Stores the document in Google Drive
 * - Adds a document link to Google Sheets
 * - Calculates expiration and reminder dates
 */

// ==================================================
// CONFIGURATION
// ==================================================

const TEMPLATE_ID = 'YOUR_GOOGLE_DOC_TEMPLATE_ID';
const FOLDER_ID = 'YOUR_DESTINATION_FOLDER_ID';


// ==================================================
// FORM SUBMISSION
// ==================================================

function onFormSubmit(e) {

  const response = e.response;
  const itemResponses = response.getItemResponses();
  const email = response.getRespondentEmail();
  const submissionDate = response.getTimestamp();

  const responses = {};

  itemResponses.forEach(function(itemResponse) {

    const question =
      itemResponse.getItem().getTitle().trim();

    let answer =
      itemResponse.getResponse();

    if (Array.isArray(answer)) {
      answer = answer.join(', ');
    }

    responses[question] =
      String(answer || '');

  });


  // ==================================================
  // CALCULATE AGE
  // ==================================================

  let age = '';

  const birthDate =
    findResponse(
      responses,
      'Date of birth'
    );

  if (birthDate) {

    const birth =
      convertDate(birthDate);

    const today = new Date();

    if (
      birth &&
      !isNaN(birth.getTime())
    ) {

      age =
        today.getFullYear() -
        birth.getFullYear();

      const monthDifference =
        today.getMonth() -
        birth.getMonth();

      if (
        monthDifference < 0 ||
        (
          monthDifference === 0 &&
          today.getDate() < birth.getDate()
        )
      ) {
        age--;
      }

    }

  }


  // ==================================================
  // CALCULATE BMI
  // ==================================================

  let bmi = '';

  const weightText =
    findResponse(
      responses,
      'Weight (kg)'
    );

  const heightText =
    findResponse(
      responses,
      'Height (cm)'
    );

  const weight =
    extractNumber(weightText);

  const heightCm =
    extractNumber(heightText);

  if (
    !isNaN(weight) &&
    !isNaN(heightCm) &&
    weight > 0 &&
    heightCm > 0
  ) {

    const heightM =
      heightCm / 100;

    bmi =
      weight / (heightM * heightM);

    bmi =
      bmi.toFixed(2);

  }


  // ==================================================
  // CREATE DOCUMENT NAME
  // ==================================================

  const fullName =
    findResponse(
      responses,
      'Full name'
    ) || 'Unnamed record';

  const date =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd-MM-yyyy HH-mm'
    );

  const fileName =
    fullName + ' - ' + date;


  // ==================================================
  // CREATE DOCUMENT FROM TEMPLATE
  // ==================================================

  const template =
    DriveApp.getFileById(TEMPLATE_ID);

  const folder =
    DriveApp.getFolderById(FOLDER_ID);

  const newFile =
    template.makeCopy(
      fileName,
      folder
    );

  const documentUrl =
    newFile.getUrl();

  const doc =
    DocumentApp.openById(
      newFile.getId()
    );

  const body =
    doc.getBody();


  // ==================================================
  // REPLACE TEMPLATE PLACEHOLDERS
  // ==================================================

  itemResponses.forEach(function(itemResponse) {

    const question =
      itemResponse
        .getItem()
        .getTitle()
        .trim();

    let answer =
      itemResponse.getResponse();

    if (Array.isArray(answer)) {
      answer = answer.join(', ');
    }


    // Format birth date as DD-MM-YYYY

    if (
      normalizeText(question) ===
      normalizeText('Date of birth') &&
      answer
    ) {

      const formattedBirthDate =
        convertDate(answer);

      if (
        formattedBirthDate &&
        !isNaN(formattedBirthDate.getTime())
      ) {

        answer =
          Utilities.formatDate(
            formattedBirthDate,
            Session.getScriptTimeZone(),
            'dd-MM-yyyy'
          );

      }

    }

    answer =
      String(answer || ' ');

    const placeholder =
      '{{' + question + '}}';

    const escapedPlaceholder =
      placeholder.replace(
        /[-\/\\^$*+?.()|[\]{}]/g,
        '\\$&'
      );

    body.replaceText(
      escapedPlaceholder,
      answer
    );

  });


  // ==================================================
  // REPLACE EMAIL
  // ==================================================

  body.replaceText(
    '\\{\\{Email\\}\\}',
    email || ' '
  );


  // ==================================================
  // REPLACE SUBMISSION DATE
  // ==================================================

  const formattedSubmissionDate =
    Utilities.formatDate(
      submissionDate,
      Session.getScriptTimeZone(),
      'dd/MM/yyyy'
    );

  body.replaceText(
    '\\{\\{Submission date\\}\\}',
    formattedSubmissionDate
  );


  // ==================================================
  // REPLACE AGE
  // ==================================================

  body.replaceText(
    '\\{\\{Age\\}\\}',
    age !== ''
      ? String(age)
      : ' '
  );


  // ==================================================
  // REPLACE BMI
  // ==================================================

  body.replaceText(
    '\\{\\{BMI\\}\\}',
    bmi !== ''
      ? String(bmi)
      : ' '
  );


  // ==================================================
  // CLEAN UNUSED PLACEHOLDERS
  // ==================================================

  cleanPlaceholders(body);


  // ==================================================
  // SAVE DOCUMENT
  // ==================================================

  doc.saveAndClose();


  // ==================================================
  // UPDATE RESPONSE SPREADSHEET
  // ==================================================

  updateSpreadsheet(
    e,
    submissionDate,
    documentUrl
  );

}


// ==================================================
// UPDATE RESPONSE SPREADSHEET
// ==================================================

function updateSpreadsheet(
  e,
  responseDate,
  documentUrl
) {

  const form = e.source;

  const spreadsheetId =
    form.getDestinationId();

  if (!spreadsheetId) {

    throw new Error(
      'The form does not have a linked response spreadsheet.'
    );

  }

  const spreadsheet =
    SpreadsheetApp.openById(
      spreadsheetId
    );

  const sheets =
    spreadsheet.getSheets();

  let sheet = null;

  for (let i = 0; i < sheets.length; i++) {

    const lastColumn =
      sheets[i].getLastColumn();

    if (lastColumn === 0) {
      continue;
    }

    const headers =
      sheets[i]
        .getRange(
          1,
          1,
          1,
          lastColumn
        )
        .getValues()[0];

    if (
      headers.indexOf(
        'Document link'
      ) !== -1
    ) {

      sheet = sheets[i];
      break;

    }

  }

  if (!sheet) {

    throw new Error(
      'The "Document link" column was not found.'
    );

  }


  // ==================================================
  // FIND DOCUMENT LINK COLUMN
  // ==================================================

  const lastColumn =
    sheet.getLastColumn();

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0];

  const documentLinkColumn =
    headers.indexOf(
      'Document link'
    ) + 1;


  // ==================================================
  // FIND RESPONSE ROW
  // ==================================================

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {

    throw new Error(
      'No form responses were found.'
    );

  }

  const timestamps =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getValues();

  let matchedRow = -1;

  for (
    let i = 0;
    i < timestamps.length;
    i++
  ) {

    const timestamp =
      timestamps[i][0];

    if (
      timestamp instanceof Date
    ) {

      const difference =
        Math.abs(
          timestamp.getTime() -
          responseDate.getTime()
        );

      // Allow a 10-second difference
      if (difference <= 10000) {

        matchedRow =
          i + 2;

        break;

      }

    }

  }

  if (matchedRow === -1) {
    matchedRow = lastRow;
  }


  // ==================================================
  // CREATE CLICKABLE DOCUMENT LINK
  // ==================================================

  const richText =
    SpreadsheetApp
      .newRichTextValue()
      .setText(
        'Open document'
      )
      .setLinkUrl(
        documentUrl
      )
      .build();

  sheet
    .getRange(
      matchedRow,
      documentLinkColumn
    )
    .setRichTextValue(
      richText
    );


  // ==================================================
  // ADD EXPIRATION / REMINDER FORMULAS
  // ==================================================

  addExpirationFormulas(
    matchedRow,
    sheet
  );

}


// ==================================================
// ADD EXPIRATION / REMINDER FORMULAS
// ==================================================

function addExpirationFormulas(
  row,
  sheet
) {

  const lastColumn =
    sheet.getLastColumn();

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0];

  const issueDateColumn =
    headers.indexOf(
      'Issue date'
    ) + 1;

  if (issueDateColumn === 0) {

    throw new Error(
      'The "Issue date" column was not found.'
    );

  }

  const issueDateLetter =
    getColumnLetter(
      issueDateColumn
    );


  // ==================================================
  // EXPIRATION DATE
  // ==================================================

  const expirationFormula =
    '=IF(' +
    issueDateLetter + row +
    '="";"";' +
    issueDateLetter + row +
    '+(365*3))';

  sheet
    .getRange(
      row,
      35
    )
    .setFormula(
      expirationFormula
    );


  // ==================================================
  // REMINDER DATE
  // ==================================================

  const reminderFormula =
    '=IF(' +
    issueDateLetter + row +
    '="";"";' +
    'AI' + row +
    '-30)';

  sheet
    .getRange(
      row,
      36
    )
    .setFormula(
      reminderFormula
    );

}


// ==================================================
// CONVERT COLUMN NUMBER TO LETTER
// ==================================================

function getColumnLetter(
  columnNumber
) {

  let letter = '';

  while (
    columnNumber > 0
  ) {

    const remainder =
      (columnNumber - 1) % 26;

    letter =
      String.fromCharCode(
        65 + remainder
      ) + letter;

    columnNumber =
      Math.floor(
        (columnNumber - 1) / 26
      );

  }

  return letter;

}


// ==================================================
// FIND RESPONSE
// ==================================================

function findResponse(
  responses,
  searchedName
) {

  const searched =
    normalizeText(
      searchedName
    );

  for (
    const question in responses
  ) {

    if (
      normalizeText(question) ===
      searched
    ) {

      return responses[question];

    }

  }

  return '';

}


// ==================================================
// NORMALIZE TEXT
// ==================================================

function normalizeText(
  text
) {

  return String(
    text || ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    );

}


// ==================================================
// EXTRACT NUMBER
// ==================================================

function extractNumber(
  text
) {

  if (!text) {
    return NaN;
  }

  const normalizedText =
    String(text)
      .replace(
        ',',
        '.'
      );

  const match =
    normalizedText.match(
      /\d+(\.\d+)?/
    );

  if (!match) {
    return NaN;
  }

  return parseFloat(
    match[0]
  );

}


// ==================================================
// CONVERT DATE
// ==================================================

function convertDate(
  value
) {

  if (
    value instanceof Date
  ) {
    return value;
  }

  const date =
    new Date(value);

  if (
    !isNaN(
      date.getTime()
    )
  ) {
    return date;
  }

  return null;

}


// ==================================================
// CLEAN UNUSED PLACEHOLDERS
// ==================================================

function cleanPlaceholders(
  element
) {

  if (
    element.getType() ===
    DocumentApp.ElementType.TEXT
  ) {

    element
      .asText()
      .replaceText(
        '\\{\\{[^}]*\\}\\}',
        ' '
      );

    return;

  }

  if (
    typeof element.getNumChildren !==
    'function'
  ) {
    return;
  }

  const numberOfChildren =
    element.getNumChildren();

  for (
    let i = numberOfChildren - 1;
    i >= 0;
    i--
  ) {

    const child =
      element.getChild(i);

    cleanPlaceholders(
      child
    );

  }

}
