// Weekly closes for the page, fetched at most once per day.
// The response is cached by Vercel's CDN for the day (s-maxage), keyed by ?day=YYYY-MM-DD (Berlin date),
// so only the first request of a day reaches Yahoo Finance, Stooq and Kraken.

// id: key used by the page · yahoo/stooq: source symbols · start: Monday of the first week shown · fx: convert to USD
const TICKERS = [
  { id: "COIN", yahoo: "COIN", stooq: "coin.us", start: "2024-10-07" },
  { id: "HOOD", yahoo: "HOOD", stooq: "hood.us", start: "2024-10-07" },
  { id: "CRCL", yahoo: "CRCL", stooq: "crcl.us", start: "2025-06-02" },
  { id: "GLXY", yahoo: "GLXY", stooq: "glxy.us", start: "2025-05-12" },
  { id: "BLSH", yahoo: "BLSH", stooq: "blsh.us", start: "2025-08-11" },
  { id: "ETOR", yahoo: "ETOR", stooq: "etor.us", start: "2025-05-12" },
  { id: "FIGR", yahoo: "FIGR", stooq: "figr.us", start: "2025-09-08" },
  { id: "GEMI", yahoo: "GEMI", stooq: "gemi.us", start: "2025-09-08" },
  { id: "BTGO", yahoo: "BTGO", stooq: "btgo.us", start: "2026-01-26" },
  { id: "BKKT", yahoo: "BKKT", stooq: "bkkt.us", start: "2024-10-07" },
  { id: "MSTR", yahoo: "MSTR", stooq: "mstr.us", start: "2024-10-07" },
  { id: "XXI",  yahoo: "XXI",  stooq: "xxi.us",  start: "2025-12-08" },
  { id: "BMNR", yahoo: "BMNR", stooq: "bmnr.us", start: "2025-06-30" },   // Ethereum treasury since 30 Jun 2025
  { id: "MTPL", yahoo: "3350.T", stooq: "3350.jp", start: "2024-10-07", fx: "JPY" }, // Metaplanet, Tokyo, in yen
  { id: "CYPH", yahoo: "CYPH", stooq: "cyph.us", start: "2025-11-10" }    // Zcash treasury since 12 Nov 2025
];
const FX = { JPY: { yahoo: "JPY=X", stooq: "usdjpy" } };   // yen per US dollar
const FROM = 1728000000;          // 4 Oct 2024 00:00 UTC, a few days before the first week shown
const BTC_FIRST = 1728518400;     // first Kraken weekly bar shown on the page
const DAY = 864e5;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; crypto-stocks-vs-bitcoin/1.0)", "Accept": "application/json,text/csv,*/*" };

const berlinDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const monday = ms => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (d.getUTCDay() + 6) % 7); };

async function get(url, type) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return type === "text" ? r.text() : r.json();
}

// rows are [local-time ms, close]; Yahoo stamps weekly bars in exchange time, so shift by the exchange offset
async function yahoo(sym) {
  const now = Math.floor(Date.now() / 1000);
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${FROM}&period2=${now}&interval=1wk&includePrePost=false`);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) throw new Error("no data");
  const off = (r.meta && r.meta.gmtoffset ? r.meta.gmtoffset : 0) * 1000;
  const c = r.indicators.quote[0].close, rows = [];
  r.timestamp.forEach((ts, i) => { if (c[i] != null) rows.push([ts * 1000 + off, c[i]]); });
  if (!rows.length) throw new Error("no data");
  const last = r.meta && r.meta.regularMarketTime ? r.meta.regularMarketTime * 1000 : rows[rows.length - 1][0];
  return { rows, last };
}

async function stooq(sym) {
  const csv = await get(`https://stooq.com/q/d/l/?s=${sym}&i=w`, "text");
  const rows = csv.trim().split("\n").slice(1).map(l => l.split(",")).filter(p => p.length >= 5 && +p[4] > 0).map(p => [Date.parse(p[0]), +p[4]]);
  if (!rows.length) throw new Error("no data");
  return { rows, last: rows[rows.length - 1][0] };
}

const byWeek = rows => { const m = new Map(); rows.forEach(([ms, v]) => m.set(monday(ms), v)); return m; };

// one value per week (keyed by Monday), starting exactly at the page's start week, no gaps
function weekly(m, start) {
  const s = Date.parse(start);
  const ks = [...m.keys()].filter(k => k >= s).sort((a, b) => a - b);
  if (!ks.length || ks[0] !== s) throw new Error("history does not reach " + start);
  for (let i = 1; i < ks.length; i++) if (ks[i] - ks[i - 1] !== 7 * DAY) throw new Error("gap after " + iso(ks[i - 1]));
  return [start, ks.map(k => Math.round(m.get(k) * 1e4) / 1e4)];
}

// local-currency weekly closes divided by the same week's exchange rate
function toUSD(m, fx) {
  const out = new Map(), keys = [...fx.keys()].sort((a, b) => a - b);
  for (const [k, v] of m) {
    let rate = fx.get(k);
    if (rate == null) { const prev = keys.filter(x => x <= k).pop(); rate = prev != null ? fx.get(prev) : null; }
    if (!rate) throw new Error("no exchange rate for " + iso(k));
    out.set(k, v / rate);
  }
  return out;
}

async function kraken() {
  const j = await get("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080&since=1728000000");
  if (j.error && j.error.length) throw new Error(j.error.join(", "));
  const key = Object.keys(j.result).find(k => k !== "last");
  const rows = j.result[key].filter(r => r[0] >= BTC_FIRST).map(r => [r[0], +r[4]]);
  if (!rows.length || rows[0][0] !== BTC_FIRST) throw new Error("history incomplete");
  return rows;
}

async function series(name, sources, errors) {
  for (const [src, fn, sym] of sources) {
    try { return await fn(sym); } catch (e) { errors.push(`${name} (${src}): ${e.message}`); }
  }
  return null;
}

module.exports = async (req, res) => {
  const today = berlinDay();
  const asked = req.query && typeof req.query.day === "string" ? req.query.day : "";
  if (asked !== today) {                       // one cache entry per day: normalise every request to today's key
    res.statusCode = 307;
    res.setHeader("Location", "/api/prices?day=" + today);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  }
  const out = { day: today, fetchedAt: new Date().toISOString(), stocks: {}, errors: [] };
  const fx = {};
  await Promise.all(Object.entries(FX).map(async ([cur, s]) => {
    const r = await series(cur, [["yahoo", yahoo, s.yahoo], ["stooq", stooq, s.stooq]], out.errors);
    if (r) fx[cur] = byWeek(r.rows);
  }));
  let stockEnd = 0;
  await Promise.all(TICKERS.map(async t => {
    const r = await series(t.id, [["yahoo", yahoo, t.yahoo], ["stooq", stooq, t.stooq]], out.errors);
    if (!r) return;
    try {
      let m = byWeek(r.rows);
      if (t.fx) { if (!fx[t.fx]) throw new Error("no " + t.fx + " rate"); m = toUSD(m, fx[t.fx]); }
      out.stocks[t.id] = weekly(m, t.start);
      if (!t.fx) stockEnd = Math.max(stockEnd, r.last);
    } catch (e) { out.errors.push(`${t.id}: ${e.message}`); }
  }));
  try { out.btc = await kraken(); out.btcEnd = today; } catch (e) { out.errors.push("BTC (kraken): " + e.message); }
  out.stockEnd = stockEnd ? iso(stockEnd) : null;
  const ok = Object.keys(out.stocks).length > 0 || !!out.btc;
  res.statusCode = ok ? 200 : 502;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", ok ? "public, max-age=0, s-maxage=86400" : "public, max-age=0, s-maxage=600"); // failures are cached briefly so repeated requests cannot hammer the sources
  res.end(JSON.stringify(out));
};
