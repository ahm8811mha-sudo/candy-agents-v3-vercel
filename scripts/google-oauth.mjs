import http from "node:http";
import { google } from "googleapis";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const port = Number(process.env.GOOGLE_OAUTH_PORT || 53682);
const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://127.0.0.1:${port}/oauth2callback`;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this script.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const scopes = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: scopes,
});

console.log("\n1. Add this exact redirect URI to the Google OAuth client:");
console.log(`   ${redirectUri}`);
console.log("\n2. Open this authorization URL in your browser:\n");
console.log(authorizationUrl);
console.log("\n3. Approve access. This local process will receive the callback.\n");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", redirectUri);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end("Not found");
      return;
    }

    const error = url.searchParams.get("error");
    if (error) throw new Error(`Google authorization failed: ${error}`);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Google callback did not contain an authorization code.");

    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Orvanta Google Workspace authorization completed. Return to the terminal.");

    console.log("Authorization completed.");
    if (!tokens.refresh_token) {
      console.error("No refresh token was returned. Revoke the app access, then run again with prompt=consent.");
      process.exitCode = 1;
    } else {
      console.log("\nCopy this value directly into Vercel as GOOGLE_REFRESH_TOKEN. Do not commit it:\n");
      console.log(tokens.refresh_token);
    }
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "Authorization failed");
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Waiting for Google callback on ${redirectUri}`);
});
