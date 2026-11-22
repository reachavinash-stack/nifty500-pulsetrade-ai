"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  HelpCircle,
  Layers,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

interface SourceLink {
  title: string;
  url: string;
  published_at: string;
}

interface StockSetup {
  symbol: string;
  company_name: string;
  sector: string;
  direction: "LONG" | "SHORT";
  ltp: number;
  sma_50: number;
  sma_200: number;
  crossover_window: "1D" | "1W" | "ESTABLISHED";
  macd_line: number;
  macd_signal: number;
  macd_hist: number;
  rsi_14: number;
  high_52w: number;
  low_52w: number;
  ath: number;
  atl: number;
  dist_52w_high_pct: number;
  dist_ath_pct: number;
  dist_52w_low_pct: number;
  dist_atl_pct: number;
  min_proximity_pct: number;
  is_priority_proximity: boolean;
  nearest_level_label: string;
  sentiment: "POSITIVE" | "NEGATIVE";
  catalyst_category: string;
  ai_summary: string;
  sources: SourceLink[];
}

interface ScanPayload {
  scan_timestamp_ist: string;
  universe_count: number;
  summary: {
    long_total: number;
    long_1d_cross: number;
    long_1w_cross: number;
    short_total: number;
    short_1d_cross: number;
    short_1w_cross: number;
  };
  long_setups: StockSetup[];
  short_setups: StockSetup[];
}

interface FaqItem {
  term: string;
  badge: string;
  badgeStyle: string;
  definition: string;
  screenerRule: string;
}

const SCREENER_FAQS: FaqItem[] = [
  {
    term: "Golden Cross (50 DMA × 200 DMA)",
    badge: "Long Trend Signal",
    badgeStyle: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    definition:
      "A bullish long-term regime shift triggered when the short-term 50-day Simple Moving Average (SMA) crosses above the long-term 200-day SMA, signaling sustained institutional accumulation.",
    screenerRule:
      "Screener requires 50 DMA > 200 DMA and tags fresh crossovers occurring on the previous trading day (1D) or within the past 5 sessions (1W) ahead of older active trends.",
  },
  {
    term: "Death Cross (50 DMA × 200 DMA)",
    badge: "Short Trend Signal",
    badgeStyle: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    definition:
      "A bearish structural breakdown triggered when the 50-day SMA crosses below the 200-day SMA, indicating deteriorating medium-term momentum and institutional distribution.",
    screenerRule:
      "Screener requires 50 DMA < 200 DMA and prioritizes fresh 1D and 1W downward crossovers paired with negative regulatory or earnings catalysts.",
  },
  {
    term: "MACD (12, 26, 9) Momentum",
    badge: "Trend Velocity",
    badgeStyle: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    definition:
      "Moving Average Convergence Divergence tracks the spread between the 12-day and 26-day Exponential Moving Averages (MACD Line) relative to its 9-day EMA (Signal Line). The MACD Histogram measures the distance between the two lines.",
    screenerRule:
      "Long setups require MACD Line > Signal Line with a positive histogram (> 0). Short setups require MACD Line < Signal Line with a negative histogram (< 0).",
  },
  {
    term: "14-Day RSI (Relative Strength Index)",
    badge: "Momentum Regime",
    badgeStyle: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    definition:
      "A bounded momentum oscillator (0–100) measuring the speed and magnitude of recent price changes over 14 sessions to distinguish healthy trend strength from overextended extremes.",
    screenerRule:
      "Longs must sit between 50 and 70 (confirmed bullish strength without overbought exhaustion > 70). Shorts must sit between 30 and 50 (bearish pressure without oversold bounce risk < 30).",
  },
  {
    term: "Proximity Threshold (≤ 2% Priority Zone)",
    badge: "Breakout / Breakdown Filter",
    badgeStyle: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    definition:
      "Measures the percentage distance between the current closing price and major structural resistance or support: 52-Week High / All-Time High (ATH) for Longs, and 52-Week Low / All-Time Low (ATL) for Shorts.",
    screenerRule:
      "Stocks trading within ≤ 2.0% of these levels are flagged in the Priority Zone for imminent breakout/breakdown setups. Use the dashboard slider to expand visibility up to 5.0%.",
  },
];

const FALLBACK_SAMPLE_DATA: ScanPayload = {
  scan_timestamp_ist: "21 Nov 2026, 08:22 AM IST",
  universe_count: 500,
  summary: {
    long_total: 2,
    long_1d_cross: 1,
    long_1w_cross: 1,
    short_total: 1,
    short_1d_cross: 1,
    short_1w_cross: 0,
  },
  long_setups: [
    {
      symbol: "BEL",
      company_name: "Bharat Electronics Ltd.",
      sector: "Capital Goods",
      direction: "LONG",
      ltp: 342.85,
      sma_50: 318.4,
      sma_200: 317.9,
      crossover_window: "1D",
      macd_line: 6.42,
      macd_signal: 4.85,
      macd_hist: 1.57,
      rsi_14: 63.4,
      high_52w: 346.0,
      low_52w: 221.5,
      ath: 346.0,
      atl: 18.2,
      dist_52w_high_pct: 0.91,
      dist_ath_pct: 0.91,
      dist_52w_low_pct: 54.78,
      dist_atl_pct: 1783.7,
      min_proximity_pct: 0.91,
      is_priority_proximity: true,
      nearest_level_label: "0.91% from ATH (₹346.00)",
      sentiment: "POSITIVE",
      catalyst_category: "Major Defence Order Win",
      ai_summary:
        "BEL triggered a fresh 1-day Golden Cross (50 DMA ₹318.40 > 200 DMA ₹317.90) with RSI at 63.4 while trading just 0.91% below its All-Time High of ₹346.00. The breakout is backed by Ministry of Defence order inflows worth ₹2,463 crore for electronic warfare suites disclosed via NSE filings.",
      sources: [
        {
          title: "[NSE Filing: Order Win] Receipt of defence electronics orders worth Rs 2,463 Cr",
          url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements-xbrl",
          published_at: "19 Nov 2026",
        },
      ],
    },
    {
      symbol: "SUNPHARMA",
      company_name: "Sun Pharmaceutical Industries Ltd.",
      sector: "Healthcare",
      direction: "LONG",
      ltp: 1948.2,
      sma_50: 1872.1,
      sma_200: 1859.6,
      crossover_window: "1W",
      macd_line: 24.1,
      macd_signal: 19.3,
      macd_hist: 4.8,
      rsi_14: 61.8,
      high_52w: 1980.0,
      low_52w: 1490.0,
      ath: 1980.0,
      atl: 42.0,
      dist_52w_high_pct: 1.61,
      dist_ath_pct: 1.61,
      dist_52w_low_pct: 30.75,
      dist_atl_pct: 4538.5,
      min_proximity_pct: 1.61,
      is_priority_proximity: true,
      nearest_level_label: "1.61% from ATH (₹1,980.00)",
      sentiment: "POSITIVE",
      catalyst_category: "USFDA Specialty Approval",
      ai_summary:
        "Sun Pharma registered a 1-week Golden Cross confirmation with a positive MACD histogram (+4.80) and sits 1.61% off its lifetime high of ₹1,980.00. Institutional accumulation accelerated following USFDA final approval for its specialty dermatology NDA and Q2 margin expansion.",
      sources: [
        {
          title: "Sun Pharma receives USFDA nod for specialty dermatology formulation - Economic Times",
          url: "https://news.google.com",
          published_at: "14 Nov 2026",
        },
      ],
    },
  ],
  short_setups: [
    {
      symbol: "BANDHANBNK",
      company_name: "Bandhan Bank Ltd.",
      sector: "Financial Services",
      direction: "SHORT",
      ltp: 158.4,
      sma_50: 176.2,
      sma_200: 176.85,
      crossover_window: "1D",
      macd_line: -4.15,
      macd_signal: -2.9,
      macd_hist: -1.25,
      rsi_14: 36.2,
      high_52w: 222.0,
      low_52w: 156.1,
      ath: 741.0,
      atl: 152.0,
      dist_52w_high_pct: 28.65,
      dist_ath_pct: 78.62,
      dist_52w_low_pct: 1.47,
      dist_atl_pct: 4.21,
      min_proximity_pct: 1.47,
      is_priority_proximity: true,
      nearest_level_label: "1.47% from 52W Low (₹156.10)",
      sentiment: "NEGATIVE",
      catalyst_category: "RBI Supervisory Scrutiny & NPA Rise",
      ai_summary:
        "Bandhan Bank printed a
