// src/sheets/sheetsClient.js
require('dotenv').config();
const { google } = require('googleapis');

function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes,
  });
  return google.sheets({ version: 'v4', auth });
}

async function readNames(sheetId, range) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  return res.data.values;
}

async function writeRow(sheetId, range, values) {
  const sheets = getSheetsClient();
  try {
    console.log('[SHEETS] Attempting to write:', { sheetId, range, values });
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
    console.log('[SHEETS] Write result:', res.data);
  } catch (err) {
    console.error('[SHEETS] Write error:', err.response ? err.response.data : err.message);
    throw err;
  }
}

module.exports = { readNames, writeRow };
