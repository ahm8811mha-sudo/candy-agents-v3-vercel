import { google } from "googleapis";

export async function appendToSheet(range: string, values: unknown[][]) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!email || !privateKey || !sheetId) throw new Error("Missing Google Sheets environment variables");

  const auth = new google.auth.JWT({ email, key: privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({ spreadsheetId: sheetId, range, valueInputOption: "USER_ENTERED", requestBody: { values } });
}
