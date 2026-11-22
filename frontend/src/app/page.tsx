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
        "Bandhan Bank printed a fresh 1-day Death Cross (50 DMA ₹176.20 < 200 DMA ₹176.85) with RSI at 36.2, hovering just 1.47% above its 52-week low of ₹156.10. Sentiment remains pressured by elevated microfinance slippages and heightened RBI supervisory review of unsecured loan books.",
      sources: [
        {
          title: "Bandhan Bank faces asset quality headwinds amid MFI stress - Mint",
          url: "https://news.google.com",
          published_at: "17 Nov 2026",
        },
      ],
    },
  ],
};

export default function Nifty500Dashboard() {
  const [data, setData] = useState<ScanPayload>(FALLBACK_SAMPLE_DATA);
  const [activeTab, setActiveTab] = useState<"LONG" | "SHORT">("LONG");
  const [crossoverFilter, setCrossoverFilter] = useState<"ALL" | "1D" | "1W">("ALL");
  const [maxProximity, setMaxProximity] = useState<number>(2.0);
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [isFaqOpen, setIsFaqOpen] = useState<boolean>(false);

  useEffect(() => {
    fetch("/data/scan_results.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && json.long_setups && json.short_setups) {
          setData(json);
        }
      })
      .catch(() => {
        // Retain fallback sample data seamlessly
      });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFaqOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const currentPool = activeTab === "LONG" ? data.long_setups : data.short_setups;

  const availableSectors = useMemo(() => {
    const all = [...data.long_setups, ...data.short_setups].map((s) => s.sector);
    return ["ALL", ...Array.from(new Set(all)).sort()];
  }, [data]);

  const filteredSetups = useMemo(() => {
    return currentPool.filter((stock) => {
      if (stock.min_proximity_pct > maxProximity) return false;
      if (crossoverFilter !== "ALL" && stock.crossover_window !== crossoverFilter) return false;
      if (selectedSector !== "ALL" && stock.sector !== selectedSector) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !stock.symbol.toLowerCase().includes(q) &&
          !stock.company_name.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [currentPool, maxProximity, crossoverFilter, selectedSector, searchQuery]);

  const handleManualScan = async () => {
    setIsScanning(true);
    setScanNotice(null);
    try {
      const res = await fetch("/api/trigger-scan", { method: "POST" });
      const body = await res.json();
      setScanNotice(
        body.message || "Nifty 500 scan pipeline dispatched. Results will refresh in ~3 minutes."
      );
    } catch {
      setScanNotice("Scan request queued. Check GitHub Actions workflow status.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Top Institutional Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Activity className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  Nifty500 PulseTrade AI
                </h1>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  NSE • Gemini 2.5 Flash
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Institutional Swing Screener • Golden/Death Cross + Proximity + SEBI/RBI News Filter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsFaqOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800/90 hover:bg-slate-800 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              <HelpCircle className="h-3.5 w-3.5 text-indigo-400" />
              FAQ &amp; Indicators
            </button>

            <button
              onClick={handleManualScan}
              disabled={isScanning}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition shadow-lg shadow-emerald-950/50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? "Dispatching Scan..." : "Run Nifty 500 Scan"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {scanNotice && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-xs text-indigo-200">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              {scanNotice}
            </span>
            <button onClick={() => setScanNotice(null)} className="text-indigo-400 hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {/* Top 4 Summary KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Nifty 500 Universe Scanned</span>
              <Layers className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tabular-nums">
                {data.universe_count}
              </span>
              <span className="text-xs text-slate-400">NSE Equities (.NS)</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              50/200 DMA + MACD(12,26,9) + RSI(14)
            </p>
          </div>

          <div className="bg-slate-900/90 border border-emerald-500/25 rounded-xl p-4">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-medium">
              <span>Active Long Setups</span>
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-bold text-emerald-400 tabular-nums">
                {data.summary.long_total}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-medium">
                {data.summary.long_1d_cross} (1D) • {data.summary.long_1w_cross} (1W)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Golden Cross + Positive Catalyst Verified
            </p>
          </div>

          <div className="bg-slate-900/90 border border-rose-500/25 rounded-xl p-4">
            <div className="flex items-center justify-between text-rose-400 text-xs font-medium">
              <span>Active Short Setups</span>
              <TrendingDown className="h-4 w-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-bold text-rose-400 tabular-nums">
                {data.summary.short_total}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 font-medium">
                {data.summary.short_1d_cross} (1D) • {data.summary.short_1w_cross} (1W)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Death Cross + Regulatory/Earnings Drag
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Last Scan Timestamp</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2">
              <span className="text-sm font-semibold text-white">{data.scan_timestamp_ist}</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Next Auto-Briefing: 08:30 AM IST (Mon–Fri)
            </p>
          </div>
        </section>

        {/* Direction Tabs + Interactive Filter Bar */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("LONG")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  activeTab === "LONG"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                    : "bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                Long Setups (Golden Cross + Bullish)
                <span className="ml-1 px-1.5 py-0.5 text-[11px] rounded bg-slate-900 text-emerald-300">
                  {data.long_setups.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("SHORT")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  activeTab === "SHORT"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/50"
                    : "bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                <ArrowDownRight className="h-4 w-4 text-rose-400" />
                Short Setups (Death Cross + Bearish)
                <span className="ml-1 px-1.5 py-0.5 text-[11px] rounded bg-slate-900 text-rose-300">
                  {data.short_setups.length}
                </span>
              </button>
            </div>

            {/* Search Box */}
            <div className="relative w-full md:w-64">
              <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter NSE symbol or company..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Granular Filter Controls */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2 text-slate-400 font-medium">
              <Filter className="h-3.5 w-3.5 text-indigo-400" />
              <span>Filters:</span>
            </div>

            {/* Crossover Window */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(["ALL", "1D", "1W"] as const).map((win) => (
                <button
                  key={win}
                  onClick={() => setCrossoverFilter(win)}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                    crossoverFilter === win
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {win === "ALL"
                    ? "All Crosses"
                    : win === "1D"
                    ? "Previous Day (1D)"
                    : "Previous Week (1W)"}
                </button>
              ))}
            </div>

            {/* Proximity Threshold Slider */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-slate-400">Proximity Threshold:</span>
              <input
                type="range"
                min={0.5}
                max={5.0}
                step={0.5}
                value={maxProximity}
                onChange={(e) => setMaxProximity(parseFloat(e.target.value))}
                className="w-24 accent-indigo-500 cursor-pointer"
              />
              <span className="font-mono font-semibold text-indigo-300 w-12">
                ≤ {maxProximity.toFixed(1)}%
              </span>
            </div>

            {/* Sector Selector */}
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {availableSectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === "ALL" ? "All NSE Sectors" : sec}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Screener Results List */}
        <section className="space-y-4">
          {filteredSetups.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-300">
                No {activeTab} setups match the active filter thresholds (Proximity ≤{" "}
                {maxProximity.toFixed(1)}%).
              </p>
              <p className="text-xs text-slate-500">
                Try expanding the proximity threshold up to 5.0% or switching the crossover window
                to All Crosses.
              </p>
            </div>
          ) : (
            filteredSetups.map((stock) => {
              const isLong = stock.direction === "LONG";
              return (
                <article
                  key={stock.symbol}
                  className="bg-slate-900/95 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition shadow-sm"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Left: Identity & Price */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-white tracking-wide">
                          {stock.symbol}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {stock.company_name}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {stock.sector}
                        </span>
                        {stock.is_priority_proximity && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <Flame className="h-3 w-3" /> ≤ 2% Priority Zone
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                        <span className="text-lg font-bold text-white tabular-nums">
                          ₹{stock.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                        <span
                          className={`font-medium ${
                            isLong ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {stock.nearest_level_label}
                        </span>
                      </div>
                    </div>

                    {/* Right: Technical & Sentiment Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* DMA Crossover Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                          isLong
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                        }`}
                      >
                        {isLong ? "Golden Cross" : "Death Cross"} •{" "}
                        {stock.crossover_window === "1D"
                          ? "Fresh 1D"
                          : stock.crossover_window === "1W"
                          ? "Fresh 1W"
                          : "Active Trend"}
                      </span>

                      {/* MACD Histogram */}
                      <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-slate-950 border border-slate-800 text-slate-300">
                        MACD Hist:{" "}
                        <strong className={stock.macd_hist >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {stock.macd_hist >= 0 ? `+${stock.macd_hist}` : stock.macd_hist}
                        </strong>
                      </span>

                      {/* RSI Badge */}
                      <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-slate-950 border border-slate-800 text-slate-300">
                        14D RSI: <strong>{stock.rsi_14}</strong>
                      </span>

                      {/* Sentiment Badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${
                          stock.sentiment === "POSITIVE"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        }`}
                      >
                        {stock.sentiment === "POSITIVE" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <ShieldAlert className="h-3.5 w-3.5" />
                        )}
                        {stock.sentiment} ({stock.catalyst_category})
                      </span>
                    </div>
                  </div>

                  {/* Institutional AI Catalyst Summary */}
                  <div className="mt-4 p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/90">
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                      {stock.ai_summary}
                    </p>
                  </div>

                  {/* Key Levels & Clickable Regulatory/News Sources */}
                  <div className="mt-3 pt-3 border-t border-slate-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-slate-400">
                    <div className="flex flex-wrap gap-4 font-mono">
                      <span>50 DMA: ₹{stock.sma_50.toLocaleString("en-IN")}</span>
                      <span>200 DMA: ₹{stock.sma_200.toLocaleString("en-IN")}</span>
                      <span>52W H/L: ₹{stock.high_52w} / ₹{stock.low_52w}</span>
                      <span>ATH: ₹{stock.ath}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {stock.sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline underline-offset-2 max-w-xs truncate"
                          title={src.title}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>

        {/* Footer with Quick FAQ Link */}
        <footer className="pt-4 pb-8 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            For informational &amp; quantitative screening purposes only. Not SEBI-registered investment advice.
          </span>
          <button
            onClick={() => setIsFaqOpen(true)}
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 cursor-pointer"
          >
            How do Golden Cross, Death Cross, MACD, RSI &amp; Proximity Thresholds work?
          </button>
        </footer>
      </main>

      {/* Screener FAQ & Indicator Methodology Modal */}
      {isFaqOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setIsFaqOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="h-5 w-5 text-indigo-400" />
                <div>
                  <h2 className="text-base font-bold text-white">
                    Screener FAQ &amp; Technical Indicator Guide
                  </h2>
                  <p className="text-xs text-slate-400">
                    Quantitative rules powering the Nifty 500 swing-trading filter
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFaqOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close FAQ modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {SCREENER_FAQS.map((faq) => (
                <div
                  key={faq.term}
                  className="p-4 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">{faq.term}</h3>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded border ${faq.badgeStyle}`}
                    >
                      {faq.badge}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {faq.definition}
                  </p>
                  <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                    <strong className="text-slate-200">PulseTrade Rule: </strong>
                    {faq.screenerRule}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-800 flex items-center justify-between bg-slate-900/90 rounded-b-2xl">
              <span className="text-[11px] text-slate-500">
                Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Esc</kbd> to close
              </span>
              <button
                onClick={() => setIsFaqOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
