import base64
import json
import logging
import os
from datetime import datetime
from email.mime.text import MIMEText
from pathlib import Path
from zoneinfo import ZoneInfo

from google import genai
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from nse_holidays import is_nse_trading_day

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("PulseTradeNotifier")

IST = ZoneInfo("Asia/Kolkata")
SCAN_RESULTS_PATH = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data" / "scan_results.json"
TASKLIST_TITLE = "Nifty500 PulseTrade Alerts"

SCOPES = [
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/gmail.send",
]


def get_google_credentials() -> Credentials:
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return creds


def format_morning_briefing(scan_data: dict) -> str:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    top_longs = scan_data.get("long_setups", [])[:5]
    top_shorts = scan_data.get("short_setups", [])[:5]

    prompt = f"""
Create a crisp, actionable 8:30 AM IST NSE Pre-Market Briefing for a swing trader based on today's Nifty 500 scan.
Keep it under 180 words, bulleted, scannable, with exact NSE symbols, ₹ LTP, crossover recency (1D/1W), % distance from 52W/ATH/ATL, and the 1-line catalyst.

LONG CANDIDATES:
{json.dumps(top_longs, indent=2)}

SHORT CANDIDATES:
{json.dumps(top_shorts, indent=2)}
"""
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return response.text.strip()


def push_to_google_tasks(creds: Credentials, scan_data: dict, briefing_text: str):
    service = build("tasks", "v1", credentials=creds)
    now_ist = datetime.now(IST)
    date_label = now_ist.strftime("%d %b %Y")
    due_rfc3339 = now_ist.strftime("%Y-%m-%dT03:00:00.000Z")  # 08:30 AM IST in UTC

    # Find or create dedicated Task List
    tasklists = service.tasklists().list().execute().get("items", [])
    target_list = next((tl for tl in tasklists if tl["title"] == TASKLIST_TITLE), None)
    if not target_list:
        target_list = service.tasklists().insert(body={"title": TASKLIST_TITLE}).execute()
    list_id = target_list["id"]

    # 1. Master 8:30 AM IST Pre-Market Briefing Task
    master_task = {
        "title": f"8:30 AM Nifty 500 Stock Alerts ({date_label}) — {scan_data['summary']['long_total']} Long / {scan_data['summary']['short_total']} Short",
        "notes": briefing_text,
        "due": due_rfc3339,
    }
    service.tasks().insert(tasklist=list_id, body=master_task).execute()

    # 2. Individual High-Priority (<= 2% Proximity) Stock Tasks
    for setup in (scan_data.get("long_setups", [])[:4] + scan_data.get("short_setups", [])[:4]):
        tag = "LONG" if setup["direction"] == "LONG" else "SHORT"
        task_body = {
            "title": f"[{tag} | {setup['crossover_window']}] NSE:{setup['symbol']} @ ₹{setup['ltp']} ({setup['nearest_level_label']})",
            "notes": f"{setup['ai_summary']}\n\nRSI(14): {setup['rsi_14']} | MACD Hist: {setup['macd_hist']}",
            "due": due_rfc3339,
        }
        service.tasks().insert(tasklist=list_id, body=task_body).execute()

    logger.info("Successfully pushed 8:30 AM IST watchlist to Google Tasks.")


def send_gmail_briefing(creds: Credentials, scan_data: dict, briefing_text: str):
    recipient = os.environ.get("ALERT_RECIPIENT_EMAIL")
    if not recipient:
        return

    gmail = build("gmail", "v1", credentials=creds)
    date_label = datetime.now(IST).strftime("%d %b %Y")
    subject = f"Nifty500 PulseTrade AI • 8:30 AM IST Alerts ({date_label})"

    msg = MIMEText(briefing_text, "plain", "utf-8")
    msg["to"] = recipient
    msg["subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

    gmail.users().messages().send(userId="me", body={"raw": raw}).execute()
    logger.info(f"Sent 8:30 AM IST Gmail briefing to {recipient}.")


def main():
    now_ist = datetime.now(IST)
    if not is_nse_trading_day(now_ist.date()):
        logger.info("NSE holiday/weekend — skipping 8:30 AM notification.")
        return

    if not SCAN_RESULTS_PATH.exists():
        logger.warning("scan_results.json not found. Skipping notification.")
        return

    with open(SCAN_RESULTS_PATH, "r", encoding="utf-8") as f:
        scan_data = json.load(f)

    briefing = format_morning_briefing(scan_data)
    creds = get_google_credentials()
    push_to_google_tasks(creds, scan_data, briefing)
    send_gmail_briefing(creds, scan_data, briefing)


if __name__ == "__main__":
    main()