import { google } from "googleapis";
import { executeIntegrationOnce } from "../operations/integrationExecution";

export type GoogleCalendarEventInput = {
  actionId: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  timeZone?: string;
  attendees?: string[];
  location?: string;
};

export type GoogleCalendarEventResult = {
  eventId: string;
  htmlLink?: string | null;
  alreadyExisted: boolean;
};

function assertConfigured() {
  const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"].filter((name) => !process.env[name]);
  if (process.env.GOOGLE_INTEGRATIONS_ENABLED !== "true" || missing.length) {
    throw new Error(`Google Calendar is not configured. Missing: ${missing.join(", ") || "GOOGLE_INTEGRATIONS_ENABLED"}`);
  }
}

function oauthClient() {
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
}

function validateDateTime(value: string, label: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} is not a valid ISO date-time.`);
  return time;
}

async function createCalendarEvent(input: GoogleCalendarEventInput): Promise<GoogleCalendarEventResult> {
  assertConfigured();
  const start = validateDateTime(input.start, "start");
  const end = validateDateTime(input.end, "end");
  if (end <= start) throw new Error("Calendar event end must be after start.");
  if (!input.summary.trim()) throw new Error("Calendar event summary is required.");

  const calendar = google.calendar({ version: "v3", auth: oauthClient() });
  const existing = await calendar.events.list({
    calendarId: calendarId(),
    privateExtendedProperty: [`orvantaActionId=${input.actionId}`],
    maxResults: 1,
    singleEvents: true,
    showDeleted: false,
  });
  const existingEvent = existing.data.items?.[0];
  if (existingEvent?.id) {
    return { eventId: existingEvent.id, htmlLink: existingEvent.htmlLink, alreadyExisted: true };
  }

  const response = await calendar.events.insert({
    calendarId: calendarId(),
    sendUpdates: input.attendees?.length ? "all" : "none",
    requestBody: {
      summary: input.summary.trim(),
      description: input.description?.trim() || undefined,
      location: input.location?.trim() || undefined,
      start: { dateTime: new Date(start).toISOString(), timeZone: input.timeZone || "Asia/Riyadh" },
      end: { dateTime: new Date(end).toISOString(), timeZone: input.timeZone || "Asia/Riyadh" },
      attendees: input.attendees?.filter(Boolean).map((email) => ({ email })),
      extendedProperties: { private: { orvantaActionId: input.actionId, orvantaSource: "action-queue" } },
    },
  });
  if (!response.data.id) throw new Error("Google Calendar did not return an event id.");
  return { eventId: response.data.id, htmlLink: response.data.htmlLink, alreadyExisted: false };
}

export async function createReliableGoogleCalendarEvent(tenantId: string, input: GoogleCalendarEventInput) {
  return executeIntegrationOnce({
    tenantId,
    integration: "GOOGLE_WORKSPACE",
    operation: "calendar.event",
    idempotencyKey: input.actionId,
    request: {
      actionId: input.actionId,
      summary: input.summary,
      start: input.start,
      end: input.end,
      attendees: input.attendees || [],
    },
    execute: async () => {
      const result = await createCalendarEvent(input);
      return {
        value: result,
        externalId: result.eventId,
        externalUrl: result.htmlLink || undefined,
        receiptType: "GOOGLE_CALENDAR_EVENT",
        receipt: result,
      };
    },
  });
}
