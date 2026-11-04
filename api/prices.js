// Weekly closes for the page, fetched at most once per day.
// The response is cached by Vercel's CDN for the day (s-maxage), keyed by ?day=YYYY-MM-DD (Berlin date),
// so only the first refresh of a day reaches Yahoo Finance and Kraken.
const START = {
  COIN: "2024-10-07", HOOD: "2024-10-07", CRCL: "2025-06-02", GLXY: "2025-05-12", BLSH: "2025-08-11",
  ETOR: "2025-05-12", FIGR: "2025-09-08", GEMI: "2025-09-08", BTGO: "2026-01-26", BKKT: "2024-10-07",
  EXOD: "2024-10-07", CNCK: "2024-12-09", MSTR: "2024-10-07", XXI: "2025-12-08"
};
const FROM = 1728259200;          // 7 Oct 2024 00:00 UTC
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

async function yahoo(t) {
  const now = Math.floor(Date.now() / 1000);
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?period1=${FROM}&period2=${now}&interval=1wk&includePrePost=false`);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) throw new Error("no data");
  const c = r.indicators.quote[0].close, rows = [];
  r.timestamp.forEach((ts, i) => { if (c[i] != null) rows.push([ts * 1000, c[i]]); });
  const last = r.meta && r.meta.regularMarketTime ? r.meta.regularMarketTime * 1000 : rows[rows.length - 1][0];
  return { rows, last };
}

async function stooq(t) {
  const csv = await get(`https://stooq.com/q/d/l/?s=${t.toLowerCase()}.us&i=w`, "text");
  const rows = csv.trim().split("\n").slice(1).map(l => l.split(",")).filter(p => p.length >= 5 && +p[4] > 0).map(p => [Date.parse(p[0]), +p[4]]);
  if (!rows.length) throw new Error("no data");
  return { rows, last: rows[rows.length - 1][0] };
}

// one value per week (keyed by Monday), starting exactly at the page's start week, no gaps
function weekly(rows, start) {
  const m = new Map();
  rows.forEach(([ms, v]) => m.set(monday(ms), v));
  const s = Date.parse(start);
  const ks = [...m.keys()].filter(k => k >= s).sort((a, b) => a - b);
  if (!ks.length || ks[0] !== s) throw new Error("history does not reach " + start);
  for (let i = 1; i < ks.length; i++) if (ks[i] - ks[i - 1] !== 7 * DAY) throw new Error("gap after " + iso(ks[i - 1]));
  return [start, ks.map(k => Math.round(m.get(k) * 1e4) / 1e4)];
}

async function kraken() {
  const j = await get("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080&since=1728000000");
  if (j.error && j.error.length) throw new Error(j.error.join(", "));
  const key = Object.keys(j.result).find(k => k !== "last");
  const rows = j.result[key].filter(r => r[0] >= BTC_FIRST).map(r => [r[0], +r[4]]);
  if (!rows.length || rows[0][0] !== BTC_FIRST) throw new Error("history incomplete");
  return rows;
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
  let stockEnd = 0;
  await Promise.all(Object.entries(START).map(async ([t, start]) => {
    for (const [name, src] of [["yahoo", yahoo], ["stooq", stooq]]) {
      try { const { rows, last } = await src(t); out.stocks[t] = weekly(rows, start); stockEnd = Math.max(stockEnd, last); return; }
      catch (e) { out.errors.push(`${t} (${name}): ${e.message}`); }
    }
  }));
  try { out.btc = await kraken(); out.btcEnd = today; } catch (e) { out.errors.push("BTC (kraken): " + e.message); }
  out.stockEnd = stockEnd ? iso(stockEnd) : null;
  const ok = Object.keys(out.stocks).length > 0 || !!out.btc;
  res.statusCode = ok ? 200 : 502;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", ok ? "public, max-age=0, s-maxage=86400" : "public, max-age=0, s-maxage=600"); // failures are cached briefly so repeated clicks cannot hammer the sources
  res.end(JSON.stringify(out));
};
