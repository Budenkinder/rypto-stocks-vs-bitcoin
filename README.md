# Crypto Stocks vs Bitcoin

Fourteen listed crypto stocks measured against Bitcoin since October 2024, in two categories: crypto companies (Coinbase, Robinhood, Circle, Galaxy Digital, Bullish, eToro, Figure, Gemini, BitGo, Bakkt, Exodus, Coincheck) and treasury companies (Strategy, Twenty One Capital).

Live: https://crypto-stocks-vs-bitcoin.vercel.app

The page shows:

- Bitcoin as the reference chart
- an equal-weight index per category, priced in Bitcoin, with a 13-week average
- a scoreboard with velocity (slope of the stock-to-Bitcoin ratio over 13 weeks) and a trend label
- Bitcoin sensitivity: correlation, beta and average moves when Bitcoin rose or fell
- a small chart per stock (stock vs Bitcoin, or price in USD)
- a weekly data table and an explanation of the method

It describes past prices only and is not investment advice.

## Files

| File | What it is |
|---|---|
| `index.html` | Page markup and styles |
| `app.js` | Built-in price data (`DATA0`, `BTC0`), all calculations and charts, and the refresh button |
| `api/prices.js` | Vercel serverless function: fetches weekly closes from Yahoo Finance (Stooq as fallback) and Bitcoin from Kraken |
| `vercel.json` | Security headers (Content Security Policy etc.) |

No build step and no npm dependencies. Plain HTML, JavaScript and one Node function (Node 18 or newer, uses the built-in `fetch`).

## How the daily refresh works

- The button calls `/api/prices?day=YYYY-MM-DD` with today's date in Europe/Berlin.
- The function redirects any other date to today's, and the response is cached by Vercel's CDN for the day (`s-maxage=86400`). Only the first refresh of a day contacts the price sources; failures are cached for 10 minutes.
- The browser remembers the last refresh day and the prices in `localStorage`, so the button is disabled for the rest of the day.
- A stock whose fresh history is incomplete keeps its built-in series.

## Run locally

```bash
npm i -g vercel        # once
vercel dev             # serves the page and /api/prices on http://localhost:3000
```

Opening `index.html` directly works too, but the refresh button needs `vercel dev` because it calls the function.

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
- Coincheck and Twenty One Capital start at the week their mergers closed; BitGo at its first full trading week.
- Yahoo Finance has no official API and may rate-limit requests; the function then tries Stooq.

## License

Apache License 2.0, see [LICENSE](LICENSE). The price data comes from Yahoo Finance, Stooq and Kraken and is subject to their terms.
