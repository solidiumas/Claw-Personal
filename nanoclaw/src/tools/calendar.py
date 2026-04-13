# ============================================================
# NanoClaw — Calendar Tools (Fase 7)
# ============================================================
# Read-only Google Calendar verktøy for AI-agenten.
#
# Bruker Google API Python Client med dekrypterte OAuth-tokens
# hentet fra The Vault (kun i minne).
#
# Tilgjengelige verktøy:
#   - calendar_list_events:    Vis kommende hendelser
#   - calendar_get_event:      Hent detaljer om en hendelse
#   - calendar_list_calendars: Vis brukerens kalendere
#
# VIKTIG: Kun lesetilgang (calendar.readonly scope).
#         Agenten kan ALDRI opprette, endre eller slette hendelser.
# ============================================================

import json
from datetime import datetime, timezone
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# -----------------------------------------------------------
# Tool Definitions (OpenAI function calling format)
# -----------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "calendar_list_events",
            "description": (
                "List upcoming calendar events for the user. "
                "Returns events starting from now, including title, "
                "start time, end time, location, and description. "
                "By default returns events for the next 7 days."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_results": {
                        "type": "integer",
                        "description": "Number of events to return (1-50). Default is 10.",
                        "default": 10,
                    },
                    "calendar_id": {
                        "type": "string",
                        "description": (
                            "Calendar ID to query. Default is 'primary'. "
                            "Use calendar_list_calendars to find other calendar IDs."
                        ),
                        "default": "primary",
                    },
                    "days_ahead": {
                        "type": "integer",
                        "description": "Number of days to look ahead. Default is 7.",
                        "default": 7,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_get_event",
            "description": (
                "Get detailed information about a specific calendar event "
                "by its event ID. Returns full event details including "
                "attendees, description, conference links, and reminders."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {
                        "type": "string",
                        "description": "The calendar event ID to retrieve.",
                    },
                    "calendar_id": {
                        "type": "string",
                        "description": "Calendar ID. Default is 'primary'.",
                        "default": "primary",
                    },
                },
                "required": ["event_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_list_calendars",
            "description": (
                "List all calendars the user has access to. "
                "Returns calendar name, ID, and access role. "
                "Use this to find specific calendar IDs for filtering events."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


# -----------------------------------------------------------
# Calendar Service Builder
# -----------------------------------------------------------

def _build_service(tokens: dict):
    """Bygger en Google Calendar API-tjeneste med brukerens OAuth-tokens."""
    creds = Credentials(
        token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=None,
        client_secret=None,
    )
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


# -----------------------------------------------------------
# Tool Executors
# -----------------------------------------------------------

def execute(tool_name: str, arguments: dict, tokens: dict) -> str:
    """Dispatcher for Calendar-verktøy."""
    if tool_name == "calendar_list_events":
        return _list_events(arguments, tokens)
    elif tool_name == "calendar_get_event":
        return _get_event(arguments, tokens)
    elif tool_name == "calendar_list_calendars":
        return _list_calendars(arguments, tokens)
    else:
        return f"Ukjent Calendar-verktøy: {tool_name}"


def _list_events(args: dict, tokens: dict) -> str:
    """Lister kommende kalenderhendelser."""
    max_results = min(args.get("max_results", 10), 50)
    calendar_id = args.get("calendar_id", "primary")
    days_ahead = min(args.get("days_ahead", 7), 90)

    service = _build_service(tokens)

    # Tidsvindu: nå → X dager frem
    now = datetime.now(timezone.utc)
    time_min = now.isoformat()

    from datetime import timedelta
    time_max = (now + timedelta(days=days_ahead)).isoformat()

    result = service.events().list(
        calendarId=calendar_id,
        timeMin=time_min,
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    events = result.get("items", [])
    if not events:
        return f"Ingen kommende hendelser de neste {days_ahead} dagene."

    output = []
    for event in events:
        start = event.get("start", {})
        end = event.get("end", {})
        output.append({
            "id": event.get("id"),
            "summary": event.get("summary", "(Ingen tittel)"),
            "start": start.get("dateTime", start.get("date", "")),
            "end": end.get("dateTime", end.get("date", "")),
            "location": event.get("location", ""),
            "description": (event.get("description", "") or "")[:500],
            "status": event.get("status", ""),
            "organizer": event.get("organizer", {}).get("email", ""),
        })

    return json.dumps(output, ensure_ascii=False, indent=2)


def _get_event(args: dict, tokens: dict) -> str:
    """Henter detaljert informasjon om en spesifikk hendelse."""
    event_id = args.get("event_id", "")
    calendar_id = args.get("calendar_id", "primary")

    if not event_id:
        return "Feil: 'event_id' er påkrevd for calendar_get_event."

    service = _build_service(tokens)

    event = service.events().get(
        calendarId=calendar_id,
        eventId=event_id,
    ).execute()

    start = event.get("start", {})
    end = event.get("end", {})

    attendees = []
    for a in event.get("attendees", []):
        attendees.append({
            "email": a.get("email"),
            "name": a.get("displayName", ""),
            "response": a.get("responseStatus", ""),
        })

    output = {
        "id": event.get("id"),
        "summary": event.get("summary", "(Ingen tittel)"),
        "start": start.get("dateTime", start.get("date", "")),
        "end": end.get("dateTime", end.get("date", "")),
        "location": event.get("location", ""),
        "description": event.get("description", ""),
        "status": event.get("status", ""),
        "organizer": event.get("organizer", {}).get("email", ""),
        "attendees": attendees,
        "hangout_link": event.get("hangoutLink", ""),
        "html_link": event.get("htmlLink", ""),
        "created": event.get("created", ""),
        "updated": event.get("updated", ""),
    }

    return json.dumps(output, ensure_ascii=False, indent=2)


def _list_calendars(args: dict, tokens: dict) -> str:
    """Lister alle kalendere brukeren har tilgang til."""
    service = _build_service(tokens)

    result = service.calendarList().list().execute()
    calendars = result.get("items", [])

    if not calendars:
        return "Ingen kalendere funnet."

    output = []
    for cal in calendars:
        output.append({
            "id": cal.get("id"),
            "summary": cal.get("summary", "(Uten navn)"),
            "description": cal.get("description", ""),
            "primary": cal.get("primary", False),
            "access_role": cal.get("accessRole", ""),
            "background_color": cal.get("backgroundColor", ""),
        })

    return json.dumps(output, ensure_ascii=False, indent=2)
