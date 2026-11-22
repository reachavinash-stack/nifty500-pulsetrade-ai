import io
import json
import logging
import os
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Literal, Optional
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import pandas_ta as ta
import requests
import yfinance as yf
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from nse_holidays import is_nse_trading_day

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("PulseTradeScreener")

IST = ZoneInfo("Asia/Kolkata")
NIFTY500_CSV_URL = "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv"
BASE_DIR = Path(__file__).resolve().parent
FALLBACK_CSV_PATH = BASE_DIR / "data" / "ind_nifty500list_fallback.csv"
OUTPUT_JSON_PATH = BASE_DIR.parent / "frontend" / "public" / "data" / "scan_results.json"

MAX_PROXIMITY_PCT = 5.0       # Keep up to 5% in JSON so frontend slider (2%-5%) works dynamically
PRIORITY_PROXIMITY_PCT = 2.0  # Flag <= 2% as high-priority setups


# ---------------------------------------------------------------------------
# 1. Pydantic Schemas for Gemini 2.5 Flash Structured Output
# ---------------------------------------------------------------------------
class CatalystSource(BaseModel):
    title: str
    url: str
    published_at: str


class SentimentEvaluation(BaseModel):
    sentiment: Literal["POSITIVE", "NEGATIVE", "NEUTRAL"] = Field(
        description="Overall regulatory and fundamental news sentiment over the past 30-60 days."
    )
    catalyst_category: str = Field(
        description="E.g., Earnings Beat, RBI/SEBI/USFDA Approval, Order Win, Regulatory Notice, Earnings Miss, Governance Flag, No Material Catalyst."
    )
    has_regulatory_red_flag: bool = Field(
        description="True if SEBI/RBI/ED/Income Tax show-cause notices, forensic audits, or auditor resignations are present."
    )
    institutional_summary: str = Field(
        description="Exactly 2 concise, institutional-grade sentences detailing the technical crossover/proximity trigger and the exact news/regulatory catalyst."
    )


# ---------------------------------------------------------------------------
# 2. NSE Nifty 500 Universe Loader
# ---------------------------------------------------------------------------
def fetch_nifty500_constituents() -> pd.DataFrame:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/csv,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.niftyindices.com/",
    }
    try:
        logger.info("Fetching live Nifty 500 constituent CSV from NSE Indices...")
        resp = requests.get(NIFTY500_CSV_URL, headers=headers, timeout=15)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        if "Symbol" not in df.columns or len(df) < 400:
            raise ValueError("Unexpected CSV structure from Nifty Indices.")
        # Refresh local fallback cache
        FALLBACK_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(FALLBACK_CSV_PATH, index=False)
        logger.info(f"Loaded {len(df)} Nifty 500 constituents from live NSE feed.")
    except Exception as exc:
        logger.warning(f"Live Nifty 500 fetch failed ({exc}). Falling back to {FALLBACK_CSV_PATH}")
        if not FALLBACK_CSV_PATH.exists():
            raise FileNotFoundError(f"Fallback CSV missing at {FALLBACK_CSV_PATH}")
        df = pd.read_csv(FALLBACK_CSV_PATH)

    df["Symbol"] = df["Symbol"].astype(str).str.strip()
    df["Company Name"] = df["Company Name"].astype(str).str.strip()
    df["Industry"] = df.get("Industry", pd.Series(["Diversified"] * len(df))).fillna("Diversified")
    df["YF_Ticker"] = df["Symbol"] + ".NS"
    return df[["Symbol", "Company Name", "Industry", "YF_Ticker"]].drop_duplicates(subset=["Symbol"])


# ---------------------------------------------------------------------------
# 3. Technical Analysis & Proximity Engine (pandas-ta)
# ---------------------------------------------------------------------------
def evaluate_ticker_technicals(
    symbol: str,
    company_name: str,
    sector: str,
    ohlcv: pd.DataFrame,
) -> Optional[dict]:
    df = ohlcv.dropna(subset=["Close", "High", "Low"]).copy()
    if len(df) < 210:
        return None

    # Compute indicators via pandas-ta
    df.ta.sma(length=50, append=True)
    df.ta.sma(length=200, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.rsi(length=14, append=True)

    required_cols = ["SMA_50", "SMA_200", "MACD_12_26_9", "MACDs_12_26_9", "MACDh_12_26_9", "RSI_14"]
    if not all(col in df.columns for col in required_cols):
        return None

    df = df.dropna(subset=required_cols)
    if len(df) < 10:
        return None

    curr = df.iloc[-1]
    prev = df.iloc[-2]
    last_5 = df.iloc[-6:-1]  # Previous 5 trading sessions

    close_price = float(curr["Close"])
    sma50 = float(curr["SMA_50"])
    sma200 = float(curr["SMA_200"])
    macd_line = float(curr["MACD_12_26_9"])
    macd_signal = float(curr["MACDs_12_26_9"])
    macd_hist = float(curr["MACDh_12_26_9"])
    rsi14 = float(curr["RSI_14"])

    # 52-Week (252 trading days) and All-Time High/Low levels
    trailing_252 = df.tail(252)
    high_52w = float(trailing_252["High"].max())
    low_52w = float(trailing_252["Low"].min())
    ath = float(df["High"].max())
    atl = float(df["Low"].min())

    dist_52w_high_pct = round(abs(close_price - high_52w) / high_52w * 100, 2)
    dist_ath_pct = round(abs(close_price - ath) / ath * 100, 2)
    dist_52w_low_pct = round(abs(close_price - low_52w) / low_52w * 100, 2)
    dist_atl_pct = round(abs(close_price - atl) / atl * 100, 2)

    # Check LONG criteria
    is_golden_cross_state = sma50 > sma200
    crossed_above_1d = is_golden_cross_state and (prev["SMA_50"] <= prev["SMA_200"])
    crossed_above_1w = is_golden_cross_state and bool((last_5["SMA_50"] <= last_5["SMA_200"]).any())

    # MACD bullish: line > signal with positive histogram (and fresh cross within 5 days or expanding momentum)
    macd_bull_cross_recent = bool(
        (df.iloc[-5:]["MACD_12_26_9"] <= df.iloc[-5:]["MACDs_12_26_9"]).any()
    )
    is_macd_bullish = (macd_line > macd_signal) and (macd_hist > 0) and (
        macd_bull_cross_recent or macd_hist > float(prev["MACDh_12_26_9"])
    )
    is_rsi_long = 50.0 <= rsi14 <= 70.0

    # Check SHORT criteria
    is_death_cross_state = sma50 < sma200
    crossed_below_1d = is_death_cross_state and (prev["SMA_50"] >= prev["SMA_200"])
    crossed_below_1w = is_death_cross_state and bool((last_5["SMA_50"] >= last_5["SMA_200"]).any())

    macd_bear_cross_recent = bool(
        (df.iloc[-5:]["MACD_12_26_9"] >= df.iloc[-5:]["MACDs_12_26_9"]).any()
    )
    is_macd_bearish = (macd_line < macd_signal) and (macd_hist < 0) and (
        macd_bear_cross_recent or macd_hist < float(prev["MACDh_12_26_9"])
    )
    is_rsi_short = 30.0 <= rsi14 <= 50.0

    direction = None
    crossover_window = "ESTABLISHED"
    min_proximity_pct = 999.0
    nearest_level_label = ""

    if is_golden_cross_state and is_macd_bullish and is_rsi_long:
        direction = "LONG"
        if crossed_above_1d:
            crossover_window = "1D"
        elif crossed_above_1w:
            crossover_window = "1W"

        if dist_ath_pct <= dist_52w_high_pct:
            min_proximity_pct = dist_ath_pct
            nearest_level_label = f"{dist_ath_pct:.2f}% from ATH (₹{ath:,.2f})"
        else:
            min_proximity_pct = dist_52w_high_pct
            nearest_level_label = f"{dist_52w_high_pct:.2f}% from 52W High (₹{high_52w:,.2f})"

    elif is_death_cross_state and is_macd_bearish and is_rsi_short:
        direction = "SHORT"
        if crossed_below_1d:
            crossover_window = "1D"
        elif crossed_below_1w:
            crossover_window = "1W"

        if dist_atl_pct <= dist_52w_low_pct:
            min_proximity_pct = dist_atl_pct
            nearest_level_label = f"{dist_atl_pct:.2f}% from ATL (₹{atl:,.2f})"
        else:
            min_proximity_pct = dist_52w_low_pct
            nearest_level_label = f"{dist_52w_low_pct:.2f}% from 52W Low (₹{low_52w:,.2f})"

    if direction is None or min_proximity_pct > MAX_PROXIMITY_PCT:
        return None

    return {
        "symbol": symbol,
        "company_name": company_name,
        "sector": sector,
        "direction": direction,
        "ltp": round(close_price, 2),
        "sma_50": round(sma50, 2),
        "sma_200": round(sma200, 2),
        "crossover_window": crossover_window,
        "macd_line": round(macd_line, 2),
        "macd_signal": round(macd_signal, 2),
        "macd_hist": round(macd_hist, 2),
        "rsi_14": round(rsi14, 2),
        "high_52w": round(high_52w, 2),
        "low_52w": round(low_52w, 2),
        "ath": round(ath, 2),
        "atl": round(atl, 2),
        "dist_52w_high_pct": dist_52w_high_pct,
        "dist_ath_pct": dist_ath_pct,
        "dist_52w_low_pct": dist_52w_low_pct,
        "dist_atl_pct": dist_atl_pct,
        "min_proximity_pct": min_proximity_pct,
        "is_priority_proximity": min_proximity_pct <= PRIORITY_PROXIMITY_PCT,
        "nearest_level_label": nearest_level_label,
    }


def run_batch_technical_screen(constituents: pd.DataFrame) -> list[dict]:
    tickers = constituents["YF_Ticker"].tolist()
    meta_map = constituents.set_index("YF_Ticker").to_dict(orient="index")
    technical_hits: list[dict] = []

    batch_size = 100
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i : i + batch_size]
        logger.info(f"Downloading OHLCV batch {i // batch_size + 1}/{(len(tickers) - 1) // batch_size + 1} ({len(batch)} tickers)...")
        try:
            raw = yf.download(
                tickers=batch,
                period="max",
                interval="1d",
                group_by="ticker",
                auto_adjust=True,
                threads=True,
                progress=False,
            )
        except Exception as exc:
            logger.error(f"Batch download error: {exc}")
            continue

        for yf_ticker in batch:
            try:
                if isinstance(raw.columns, pd.MultiIndex):
                    if yf_ticker not in raw.columns.get_level_values(0):
                        continue
                    stock_df = raw[yf_ticker].copy()
                else:
                    stock_df = raw.copy()

                meta = meta_map[yf_ticker]
                hit = evaluate_ticker_technicals(
                    symbol=meta["Symbol"],
                    company_name=meta["Company Name"],
                    sector=meta["Industry"],
                    ohlcv=stock_df,
                )
                if hit:
                    technical_hits.append(hit)
            except Exception as exc:
                logger.debug(f"Error evaluating {yf_ticker}: {exc}")

        time.sleep(1.5)  # Polite rate-limit pause between batches

    logger.info(f"Technical screener passed {len(technical_hits)} stocks within {MAX_PROXIMITY_PCT}% proximity.")
    return technical_hits


# ---------------------------------------------------------------------------
# 4. Indian News & NSE Corporate Disclosures Fetcher
# ---------------------------------------------------------------------------
def create_nse_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements-xbrl",
    })
    try:
        session.get("https://www.nseindia.com", timeout=8)
    except Exception:
        pass
    return session


def fetch_indian_news_and_disclosures(
    symbol: str,
    company_name: str,
    nse_session: requests.Session,
    lookback_days: int = 60,
) -> list[dict]:
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    items: list[dict] = []

    # A. Google News India RSS (NSE / SEBI / RBI focused)
    query = urllib.parse.quote(f'"{company_name}" NSE OR SEBI OR RBI')
    rss_url = f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"
    try:
        rss_resp = requests.get(rss_url, timeout=10)
        if rss_resp.status_code == 200:
            root = ET.fromstring(rss_resp.content)
            for item in root.findall(".//item")[:15]:
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                pub_date_str = (item.findtext("pubDate") or "").strip()
                try:
                    pub_dt = parsedate_to_datetime(pub_date_str)
                    if pub_dt.tzinfo is None:
                        pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                    if pub_dt < cutoff_dt:
                        continue
                    formatted_date = pub_dt.astimezone(IST).strftime("%d %b %Y")
                except Exception:
                    formatted_date = "Recent (60D)"

                if title and link:
                    items.append({
                        "source_type": "Google News IN",
                        "title": title,
                        "url": link,
                        "published_at": formatted_date,
                    })
    except Exception as exc:
        logger.debug(f"Google News RSS error for {symbol}: {exc}")

    # B. NSE Corporate Filings & XBRL Announcements API
    nse_api_url = f"https://www.nseindia.com/api/corporate-announcements?index=equities&symbol={urllib.parse.quote(symbol)}"
    try:
        nse_resp = nse_session.get(nse_api_url, timeout=8)
        if nse_resp.status_code == 200:
            announcements = nse_resp.json()
            for ann in announcements[:8]:
                subject = ann.get("desc", "")
                details = ann.get("attchmntText", "")
                an_dt = ann.get("an_dt", "")
                att_file = ann.get("attchmntFile", "")
                if subject:
                    items.append({
                        "source_type": "NSE XBRL/Filing",
                        "title": f"[NSE Filing: {subject}] {details[:180]}",
                        "url": att_file or "https://www.nseindia.com/companies-listing/corporate-filings-announcements-xbrl",
                        "published_at": an_dt or "Recent Filing",
                    })
    except Exception as exc:
        logger.debug(f"NSE XBRL feed skipped/blocked for {symbol}: {exc}")

    return items[:12]


# ---------------------------------------------------------------------------
# 5. Gemini 2.5 Flash Regulatory & News Sentiment Filter
# ---------------------------------------------------------------------------
def evaluate_sentiment_with_gemini(
    client: genai.Client,
    candidate: dict,
    news_items: list[dict],
) -> Optional[dict]:
    if not news_items:
        return None

    headlines_block = "\n".join(
        f"- [{item['published_at']}] ({item['source_type']}) {item['title']}"
        for item in news_items
    )

    prompt = f"""
You are a Senior Indian Equity Research & Regulatory Compliance Analyst covering NSE Nifty 500 equities.
Analyze the following technical setup and 30–60 day news/NSE regulatory disclosures for **{candidate['company_name']} (NSE: {candidate['symbol']})**.

### Technical Trigger Context:
- Setup Direction: {candidate['direction']}
- Crossover Status: {candidate['crossover_window']} (50 DMA: ₹{candidate['sma_50']} vs 200 DMA: ₹{candidate['sma_200']})
- Price & Proximity: ₹{candidate['ltp']} ({candidate['nearest_level_label']})
- Momentum: 14D RSI = {candidate['rsi_14']}, MACD Histogram = {candidate['macd_hist']}

### News & NSE Filings (Past 30–60 Days):
{headlines_block}

### Evaluation Rules:
1. Classify sentiment strictly as POSITIVE, NEGATIVE, or NEUTRAL based on tangible fundamental or regulatory catalysts (earnings beats/misses, RBI/SEBI/USFDA approvals or show-cause notices, ED/tax raids, auditor resignations, major order wins, credit rating upgrades/downgrades, promoter stake changes).
2. Ignore generic market wrap noise or routine administrative notices. If no material fundamental/regulatory catalyst exists, classify as NEUTRAL.
3. Write `institutional_summary` as EXACTLY 2 crisp sentences: Sentence 1 states the exact technical crossover window and % proximity to the 52W/All-Time level; Sentence 2 states the verified regulatory or earnings/order catalyst.
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SentimentEvaluation,
                temperature=0.1,
            ),
        )
        parsed = json.loads(response.text)
    except Exception as exc:
        logger.error(f"Gemini API error for {candidate['symbol']}: {exc}")
        return None

    # Strict alignment filter per trading direction
    if candidate["direction"] == "LONG":
        if parsed["sentiment"] != "POSITIVE" or parsed["has_regulatory_red_flag"]:
            return None
    elif candidate["direction"] == "SHORT":
        if parsed["sentiment"] != "NEGATIVE":
            return None

    candidate["sentiment"] = parsed["sentiment"]
    candidate["catalyst_category"] = parsed["catalyst_category"]
    candidate["ai_summary"] = parsed["institutional_summary"]
    candidate["sources"] = [
        {"title": item["title"], "url": item["url"], "published_at": item["published_at"]}
        for item in news_items[:4]
    ]
    return candidate


# ---------------------------------------------------------------------------
# 6. Main Orchestrator
# ---------------------------------------------------------------------------
def run_screener(force_run: bool = False) -> dict:
    now_ist = datetime.now(IST)
    if not force_run and not is_nse_trading_day(now_ist.date()):
        logger.info(f"Today ({now_ist.date()}) is an NSE market holiday or weekend. Exiting cleanly.")
        sys.exit(0)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is required.")

    client = genai.Client(api_key=api_key)
    constituents = fetch_nifty500_constituents()
    technical_candidates = run_batch_technical_screen(constituents)

    nse_session = create_nse_session()
    verified_longs: list[dict] = []
    verified_shorts: list[dict] = []

    for idx, cand in enumerate(technical_candidates, start=1):
        logger.info(
            f"[{idx}/{len(technical_candidates)}] Evaluating AI catalyst for {cand['symbol']} ({cand['direction']})..."
        )
        news_items = fetch_indian_news_and_disclosures(
            symbol=cand["symbol"],
            company_name=cand["company_name"],
            nse_session=nse_session,
        )
        enriched = evaluate_sentiment_with_gemini(client, cand, news_items)
        if enriched:
            if enriched["direction"] == "LONG":
                verified_longs.append(enriched)
            else:
                verified_shorts.append(enriched)
        time.sleep(0.5)  # Respect Gemini RPM limits

    # Sort by: (1) <= 2% proximity priority, (2) Crossover recency (1D > 1W > ESTABLISHED), (3) Closest % proximity
    recency_rank = {"1D": 0, "1W": 1, "ESTABLISHED": 2}
    sort_key = lambda x: (
        0 if x["is_priority_proximity"] else 1,
        recency_rank.get(x["crossover_window"], 3),
        x["min_proximity_pct"],
    )
    verified_longs.sort(key=sort_key)
    verified_shorts.sort(key=sort_key)

    payload = {
        "scan_timestamp_ist": now_ist.strftime("%d %b %Y, %I:%M %p IST"),
        "scan_iso_utc": datetime.now(timezone.utc).isoformat(),
        "universe_count": len(constituents),
        "technical_candidates_count": len(technical_candidates),
        "summary": {
            "long_total": len(verified_longs),
            "long_1d_cross": sum(1 for x in verified_longs if x["crossover_window"] == "1D"),
            "long_1w_cross": sum(1 for x in verified_longs if x["crossover_window"] == "1W"),
            "short_total": len(verified_shorts),
            "short_1d_cross": sum(1 for x in verified_shorts if x["crossover_window"] == "1D"),
            "short_1w_cross": sum(1 for x in verified_shorts if x["crossover_window"] == "1W"),
        },
        "long_setups": verified_longs,
        "short_setups": verified_shorts,
    }

    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    logger.info(
        f"Scan complete. Saved {len(verified_longs)} LONG and {len(verified_shorts)} SHORT setups to {OUTPUT_JSON_PATH}."
    )
    return payload


if __name__ == "__main__":
    force = "--force" in sys.argv
    run_screener(force_run=force)