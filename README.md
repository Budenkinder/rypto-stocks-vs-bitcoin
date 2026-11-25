# (Vibecoded) Crypto Stocks vs Bitcoin

Fourteen listed crypto stocks measured against Bitcoin since October 2024, in two categories: crypto companies (Coinbase, Robinhood, Circle, Galaxy Digital, Bullish, eToro, Figure, Gemini, BitGo) and treasury companies holding Bitcoin, Ether or Zcash (Strategy, Metaplanet, BitMine Immersion, Twenty One Capital, Cypherpunk Technologies).

Live: https://crypto-stocks-vs-bitcoin.vercel.app

The page shows:

- Bitcoin as the reference chart
- an equal-weight index per category, priced in Bitcoin, with a 13-week average
- a small chart per stock (stock vs Bitcoin, or price in USD), with its velocity (slope of the stock-to-Bitcoin ratio over 13 weeks) and trend label
- quarterly results markers on the stock charts: ▲ net profit, ▼ net loss, from each company's results release (dates and signs are in `EARN` in `app.js`; add a row after each new report)
- a weekly data table and an explanation of the method

It describes past prices only and is not investment advice.

## Files

| File | What it is |
|---|---|
| `index.html` | Page markup and styles |
| `app.js` | Built-in price data (`DATA0`, `BTC0`), all calculations and charts, and the daily price loading |
| `api/prices.js` | Vercel serverless function: fetches weekly closes from Yahoo Finance (Nasdaq and Stooq as fallbacks), USD/JPY for Metaplanet, and Bitcoin from Kraken |
| `vercel.json` | Security headers (Content Security Policy etc.) |

No build step and no npm dependencies. Plain HTML, JavaScript and one Node function (Node 18 or newer, uses the built-in `fetch`).

## How the daily price update works

- On load the page calls `/api/prices?day=YYYY-MM-DD` with today's date in Europe/Berlin. The "Refresh prices" button repeats the call if it failed.
- The function redirects any other date to today's, and the response is cached by Vercel's CDN for the day (`s-maxage=86400`). Only the first request of a day contacts the price sources; failures are cached for 10 minutes.
- The browser remembers the day and the prices in `localStorage`, so it loads them only once a day.
- A stock whose fresh history is incomplete keeps its built-in series; a stock without built-in data appears once the function has delivered it.

## Run locally

```bash
npm i -g vercel        # once
vercel dev             # serves the page and /api/prices on http://localhost:3000
```

Opening `index.html` directly works too, but then only the built-in prices show, and BitMine, Metaplanet and Cypherpunk are missing: the price loading needs `vercel dev` because it calls the function.

## Deploy

```bash
vercel link            # once: choose the existing project crypto-stocks-vs-bitcoin
vercel --prod
```

Alternatively connect the repository in the Vercel dashboard (Project → Settings → Git) so every push to `main` deploys.

## Updating the built-in data

The refresh fetches new prices at runtime, but the history bundled in `app.js` stays at the date in `EMBED.end`. To move it forward, replace `DATA0`, `BTC0` and the dates in `EMBED.end` with newer data (for example from a saved `/api/prices` response).

## Notes

- Equal weighting: every stock counts the same in its category index.
- Twenty One Capital starts at the week its merger closed, BitMine Immersion at its Ether treasury announcement (30 Jun 2025), Cypherpunk Technologies at its Zcash treasury announcement (12 Nov 2025); BitGo at its first full trading week.
- Metaplanet (Tokyo, 3350) is converted from yen to US dollars with the weekly USD/JPY close.
- BitMine, Metaplanet and Cypherpunk have no built-in history in `app.js`; they come from `/api/prices`, which the page loads automatically once a day.
- Yahoo Finance has no official API and may rate-limit requests; the function retries once, then tries Nasdaq's historical prices (US listings) and Stooq. Data that is still incomplete is cached for one hour instead of a day.

## License

Apache License 2.0, see [LICENSE](LICENSE). The price data comes from Yahoo Finance, Nasdaq, Stooq and Kraken and is subject to their terms.
