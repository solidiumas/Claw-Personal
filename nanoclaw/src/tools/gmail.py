# ============================================================
# NanoClaw — Gmail Tools (Fase 7)
# ============================================================
# Read-only Gmail verktøy for AI-agenten.
#
# Bruker Google API Python Client med dekrypterte OAuth-tokens
# hentet fra The Vault (kun i minne).
#
# Tilgjengelige verktøy:
#   - gmail_list_messages:  Vis siste e-poster i innboksen
#   - gmail_search:         Søk etter e-poster med query
#   - gmail_get_message:    Hent innholdet i en spesifikk e-post
#
# VIKTIG: Kun lesetilgang (gmail.readonly scope).
#         Agenten kan ALDRI sende, slette eller endre e-poster.
# ============================================================

import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# -----------------------------------------------------------
# Tool Definitions (OpenAI function calling format)
# -----------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "gmail_list_messages",
            "description": (
                "List the most recent emails in the user's Gmail inbox. "
                "Returns a summary of each email including sender, subject, "
                "date, and a short snippet. Use this to get an overview of "
                "what's in the inbox."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_results": {
                        "type": "integer",
                        "description": "Number of emails to return (1-20). Default is 10.",
                        "default": 10,
                    },
                    "label": {
                        "type": "string",
                        "description": (
                            "Gmail label to filter by. Default is 'INBOX'. "
                            "Other options: 'UNREAD', 'STARRED', 'IMPORTANT'."
                        ),
                        "default": "INBOX",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "gmail_search",
            "description": (
                "Search for emails in Gmail using a query string. "
                "Supports Gmail search operators like 'from:', 'to:', "
                "'subject:', 'after:', 'before:', 'has:attachment', etc. "
                "Returns matching emails with sender, subject, and snippet."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Gmail search query. Examples: "
                            "'from:john@example.com', "
                            "'subject:meeting after:2024/01/01', "
                            "'has:attachment is:unread'"
                        ),
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Number of results to return (1-20). Default is 10.",
                        "default": 10,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "gmail_get_message",
            "description": (
                "Get the full content of a specific email by its message ID. "
                "Returns the complete email including headers, body text, "
                "and attachment names. Use this after finding emails with "
                "gmail_list_messages or gmail_search."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {
                        "type": "string",
                        "description": "The Gmail message ID to retrieve.",
                    },
                },
                "required": ["message_id"],
            },
        },
    },
]


# -----------------------------------------------------------
# Gmail Service Builder
# -----------------------------------------------------------

def _build_service(tokens: dict):
    """Bygger en Gmail API-tjeneste med brukerens OAuth-tokens."""
    creds = Credentials(
        token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=None,  # Ikke nødvendig for API-kall med access_token
        client_secret=None,
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


# -----------------------------------------------------------
# Header Helpers
# -----------------------------------------------------------

def _get_header(headers: list, name: str) -> str:
    """Henter en spesifikk header fra en liste av headers."""
    for header in headers:
        if header["name"].lower() == name.lower():
            return header["value"]
    return ""


def _extract_body(payload: dict) -> str:
    """Ekstraherer brødtekst fra e-postens payload (håndterer multipart)."""
    import base64

    # Enkel body
    if payload.get("body", {}).get("data"):
        data = payload["body"]["data"]
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    # Multipart — finn text/plain
    parts = payload.get("parts", [])
    for part in parts:
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            data = part["body"]["data"]
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    # Fallback — prøv text/html
    for part in parts:
        if part.get("mimeType") == "text/html" and part.get("body", {}).get("data"):
            data = part["body"]["data"]
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    # Nested multipart
    for part in parts:
        if part.get("parts"):
            result = _extract_body(part)
            if result:
                return result

    return "(Ingen lesbar tekst funnet)"


# -----------------------------------------------------------
# Tool Executors
# -----------------------------------------------------------

def execute(tool_name: str, arguments: dict, tokens: dict) -> str:
    """Dispatcher for Gmail-verktøy."""
    if tool_name == "gmail_list_messages":
        return _list_messages(arguments, tokens)
    elif tool_name == "gmail_search":
        return _search_messages(arguments, tokens)
    elif tool_name == "gmail_get_message":
        return _get_message(arguments, tokens)
    else:
        return f"Ukjent Gmail-verktøy: {tool_name}"


def _list_messages(args: dict, tokens: dict) -> str:
    """Lister de siste e-postene i innboksen."""
    max_results = min(args.get("max_results", 10), 20)
    label = args.get("label", "INBOX")

    service = _build_service(tokens)

    result = service.users().messages().list(
        userId="me",
        labelIds=[label],
        maxResults=max_results,
    ).execute()

    messages = result.get("messages", [])
    if not messages:
        return "Ingen e-poster funnet i innboksen."

    output = []
    for msg_ref in messages:
        msg = service.users().messages().get(
            userId="me",
            id=msg_ref["id"],
            format="metadata",
            metadataHeaders=["From", "Subject", "Date"],
        ).execute()

        headers = msg.get("payload", {}).get("headers", [])
        output.append({
            "id": msg["id"],
            "from": _get_header(headers, "From"),
            "subject": _get_header(headers, "Subject"),
            "date": _get_header(headers, "Date"),
            "snippet": msg.get("snippet", ""),
        })

    return json.dumps(output, ensure_ascii=False, indent=2)


def _search_messages(args: dict, tokens: dict) -> str:
    """Søker etter e-poster med en Gmail-query."""
    query = args.get("query", "")
    max_results = min(args.get("max_results", 10), 20)

    if not query:
        return "Feil: 'query' er påkrevd for gmail_search."

    service = _build_service(tokens)

    result = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results,
    ).execute()

    messages = result.get("messages", [])
    if not messages:
        return f"Ingen e-poster funnet for søk: '{query}'"

    output = []
    for msg_ref in messages:
        msg = service.users().messages().get(
            userId="me",
            id=msg_ref["id"],
            format="metadata",
            metadataHeaders=["From", "Subject", "Date"],
        ).execute()

        headers = msg.get("payload", {}).get("headers", [])
        output.append({
            "id": msg["id"],
            "from": _get_header(headers, "From"),
            "subject": _get_header(headers, "Subject"),
            "date": _get_header(headers, "Date"),
            "snippet": msg.get("snippet", ""),
        })

    return json.dumps(output, ensure_ascii=False, indent=2)


def _get_message(args: dict, tokens: dict) -> str:
    """Henter hele innholdet i en spesifikk e-post."""
    message_id = args.get("message_id", "")
    if not message_id:
        return "Feil: 'message_id' er påkrevd for gmail_get_message."

    service = _build_service(tokens)

    msg = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full",
    ).execute()

    headers = msg.get("payload", {}).get("headers", [])
    body = _extract_body(msg.get("payload", {}))

    # Begrens body-lengde for å unngå enorme tokens
    max_body_length = 4000
    if len(body) > max_body_length:
        body = body[:max_body_length] + "\n\n... (avkortet, e-posten var for lang)"

    output = {
        "id": msg["id"],
        "from": _get_header(headers, "From"),
        "to": _get_header(headers, "To"),
        "subject": _get_header(headers, "Subject"),
        "date": _get_header(headers, "Date"),
        "body": body,
        "labels": msg.get("labelIds", []),
    }

    return json.dumps(output, ensure_ascii=False, indent=2)
