import os
import json
import urllib.request
import urllib.error
import sys

# Hent variabler fra miljøet
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
# Default til localhost:8000/v1 som per brukerens Node-eksempel
ANTHROPIC_BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "http://localhost:8000/v1")

def test_base_url():
    print("🧪 Test: Claude Agent SDK (Python) respekterer ANTHROPIC_BASE_URL")
    print(f"Base URL: {ANTHROPIC_BASE_URL}")

    # Anthropic API bruker /v1/messages
    url = f"{ANTHROPIC_BASE_URL.rstrip('/')}/messages"
    
    body = {
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 100,
        "messages": [
            {
                "role": "user",
                "content": "Say 'Base URL routing works!' and nothing else",
            }
        ]
    }
    
    # Kritiske headere for Anthropic
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    
    try:
        print(f"Sender forespørsel til: {url}...")
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            response_body = json.loads(resp.read())
            
            print(f"✅ Success! (HTTP {status})")
            content = response_body.get("content", [{}])[0].get("text")
            print("Response:", content)
            
            # KRITISK: Sjekk at request gikk gjennom LiteLLM (LiteLLM legger ofte til usage)
            if "usage" in response_body:
                print("✅ Token counts received → LiteLLM relayed correctly")
                print("Usage:", response_body["usage"])
            else:
                print("ℹ️ Ingen usage-data i responsen (kan skje avhengig av LiteLLM-versjon)")
                
    except urllib.error.HTTPError as e:
        print(f"❌ Failed: HTTP {e.code}")
        try:
            print(e.read().decode())
        except:
            print("Kunne ikke lese feilmelding.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if not ANTHROPIC_API_KEY:
        print("❌ Feil: ANTHROPIC_API_KEY er ikke satt i miljøet.")
        sys.exit(1)
    test_base_url()
