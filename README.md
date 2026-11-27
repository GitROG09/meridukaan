# MeriDukaan — बोलो, हिसाब रखो

A voice-first, mobile-first PWA for small Indian shopkeepers (kirana, sabzi vendors, tailors, food stalls). You record sales, expenses and stock purchases by speaking Hindi, Marathi, Tamil or English, mixed in any way. The app also answers "Aaj ka munafa kitna hua?" out loud.

Hackathon prototype. Plain HTML, CSS and vanilla JS: no build step or API keys. Optional account sync runs on a small Node.js/SQLite service.

## Run it (one command)

```bash
docker compose up
```

Then open **http://localhost:8080**.

The compose file serves `public/` with `nginx:alpine` on port 8080 and starts a sync service. The main screen loads with 8 seeded grocery items and sample entries. Sync data is stored in the `shop-data` Docker volume; do not delete the volume if you need that data.

Without Docker, any static server can run the local-only app, for example (account sync is not available):

```bash
python -m http.server 8080 --directory public
```

### Testing on a phone

Chrome only allows the microphone on `localhost` or HTTPS. To try it on an Android phone, use one of these:

- `chrome://inspect` port forwarding (USB), or
- an HTTPS tunnel such as `cloudflared tunnel --url http://localhost:8080`.

If voice isn't available, the typed-input box works everywhere.

## Run the tests

```bash
node tests/tests.js
node tests/sync-tests.js
node tests/static-tests.js
```

The tests use Node's built-in `assert` (no npm install). Sync tests require Node 22.11 or newer with built-in SQLite. They cover:

- number words (`teen sau`, `do hazaar`, `dedh`, `saade teen sau`, `paune do`, Devanagari/Tamil digits, `₹1,20,000`)
- parsing sales, expenses and purchases
- multiple items in one sentence
- fuzzy item matching (`chaval` → Chawal / Chana)
- missing quantity or amount
- implausible amounts
- yes/no and correction replies (`nahi, 400 hai`)
- profit and stock calculations, Indian number formatting, and template matching
- account authentication, stored snapshots, stale revision rejection and sign-out
- static deployment assets, API routing, secure cookies and required volume configuration

## Optional account sync

Use **Account and sync** in Settings to create a shop username and password (at least 10 characters), or sign in on another device. No account is needed for local use. The first sign-in to an existing account asks which complete version to keep if local data and account data both exist. Offline changes remain on the device and sync when connected. When both versions changed, sync pauses and asks you to choose; the other complete version will be replaced, not merged. Review the versions carefully before choosing.

The sync API is served by Docker at the same origin as the app. A static host alone cannot provide sync. For an internet deployment, use HTTPS and set `SECURE_COOKIES=true` in the Compose environment; browser sign-in requires HTTPS or localhost. This prototype has no password reset, account recovery, automatic backup, or production security audit. Keep backups of the Docker volume and do not use real business data until the deployment has been secured and tested. Voice recognition may send audio to the browser provider's service.

### Railway demo deployment

The root `Dockerfile` runs one service for the app and sync; it does not change the local Compose setup. Use this only for an experimental demo with synthetic data.

1. Push the latest changes to GitHub. Create a Railway account and choose **New Project → Deploy from GitHub repo**. Grant access only to the repository needed, if the authorization screen permits it.
2. Railway builds the root `Dockerfile`. Add a volume to the service with mount path `/data`. The service deliberately fails to start until the volume is attached; deploy or redeploy after attaching it. Railway supplies `RAILWAY_VOLUME_MOUNT_PATH` automatically.
3. In the service settings, under **Networking → Public Networking**, select **Generate Domain**. Open the HTTPS domain and test the app and optional account sync with sample data. The Dockerfile sets secure cookies, serves the static app and stores the SQLite database on the volume; Railway supplies the listening `PORT`.

Railway's [free plan](https://docs.railway.com/pricing/free-plan) has limited monthly usage, sleeps when idle, and stops services if the allowance runs out. New accounts start on a time-limited trial; after it ends, switch to Free and redeploy. Railway also documents trial-volume deletion after credit expiration; check its current retention terms and export backups. Availability and free-tier terms can change. This deployment and sync have not been independently security-audited; don't use real business data.

## Features

| Spoken (any mix of languages) | What happens |
|---|---|
| "Aaj paanch kilo chawal teen sau rupaye mein beche" | Card *Rice · 5 kg · ₹300 · sale*. The app says "5 kilo chawal, 300 rupaye, bikri. Sahi hai?" |
| "haan" / "ho" / "aamaa" / "yes" | Saves the entry; stock goes down |
| "nahi" | "Kya badalna hai?" |
| "nahi, 400 hai" | Changes only the amount and asks again |
| "Transport ke liye sau rupaye diye" | Expense · transport · ₹100 |
| "20 kilo chawal mangwaya 800 diye" | Stock purchase; stock goes up and the buying price is updated |
| "2 kilo cheeni 100 aur 3 packet biscuit 30" | Two cards, confirmed together |
| "Aaj ka munafa kitna hua?" | Profit read out loud and shown on screen |
| "Biscuit ke kitne packet bache?" | Stock answer |
| "Pichhla hatao" | Shows the last entry and removes it after you confirm |
| "Main kirana dukaan chalata hoon" (Setup button) | Follow-ups for items, per-item units and buying prices; say "skip" to keep the template defaults. Then a **fixed, pre-tested template** is filled in; no code is generated |

The rest of the screen:

- **Mic:** one large tap-to-talk button. The mic never listens on its own.
- **Feedback:** a live transcript line, a reply line that is also spoken (speechSynthesis) with a 🔁 replay button, and a typed fallback.
- **Tabs:** Sales / Expenses / Stock / Profit.
- **Accessibility:** buttons are at least 48 px with high contrast, and amounts use ₹ with Indian grouping (₹1,20,000).
- **Language selector:** sets the recognition locale (`hi-IN`, `mr-IN`, `ta-IN`, `en-IN`). One item matches across languages: *rice / chawal / tandul / arisi / चावल / அரிசி* are the same item.
- **First launch:** choose a language by saying its name or tapping a language button. Some browsers block the initial spoken question until a user gesture; it is also shown on screen and can be replayed.
- **8 pm prompt:** "Aaj ka hisaab sunna chahenge?" (once a day; add `?evening=1` to the URL to test it).

### When things go wrong

| Situation | Behaviour |
|---|---|
| Confidence < 0.7 or recognition error | Says "Awaaz saaf nahi aayi, phir se boliye." After 2 failures, shows tap-to-select items, a numeric-input keyboard and the typed fallback |
| Noisy shop | Tap-to-talk only, plus the hint "Noisy place? Move closer" |
| Misheard item ("chaval") | Top 3 candidates shown as buttons: "Chawal ya chana?". The app never guesses |
| Missing quantity or amount | Asks "Kitne kilo?" / "Kitne rupaye?". Nothing is saved without confirmation |
| Implausible amount (₹3,00,000 for 5 kg rice) | Warns and asks again. Saying the same value again accepts it |
| 8 s of silence | Stops listening and shows "Boliye, main sun raha hoon." |
| Mic permission denied / no internet for recognition | Explains the problem and points to the typed input |
| Offline | Data is always in `localStorage`; an offline badge is shown. A service worker caches the app shell |

## How it works

```
public/
  index.html      UI shell (mic, transcript, reply, cards, typed input, tabs)
  css/style.css   mobile-first, high-contrast styles
  js/calc.js      PURE functions: profit, stock, plausibility, ₹ formatting
  js/parser.js    rule-based NLU: number words, units, keywords, fuzzy items
  js/data.js      4 fixed shop templates + 8 seeded kirana items + sample entries
  js/app.js       conversation state machine, speech in/out, rendering
  js/sync.js      optional sync, offline changes and conflict resolution
  config.js       optional AI key (empty → "key not set"; nothing needs it)
  sw.js           offline cache
tests/tests.js    node:assert test suite
tests/sync-tests.js   sync API integration tests
server/server.js  account and SQLite snapshot API (Node.js)
```

- **Arithmetic only happens in `calc.js`.**
  - Profit = sales − buying cost of the items sold − expenses.
  - The buying cost is snapshotted on each sale.
  - Stock = opening + purchases − sales. It is derived from the entries each time, so undo is always consistent.
  - No AI model ever does arithmetic.
- **Parsing is fully rule-based.** It uses keyword sets per language, number words (Hindi/Marathi/Tamil/English, including lakh/hazaar/sau and dedh/dhai/sawa/saade/paune), unit words with conversion (gram→kg, dozen→12), and Levenshtein fuzzy matching that only *suggests* candidates.
- **Data model.** Entries are `{type: sale|purchase|expense, itemId, qty, amount, unitCost, category, ts}`, stored under the `localStorage` key `meridukaan.v1`. Use "Sample data wapas" to reset.

## Known limits

- Speech recognition uses the browser's Web Speech API. It needs Chrome, a secure context (localhost/HTTPS) and usually internet; accuracy for Marathi and Tamil varies by device.
- Main spoken replies support Hinglish, Marathi and English. Some secondary controls and sync messages remain in English or Hinglish. Tamil recognition remains available, but replies fall back to Hinglish. Device voice availability varies.
- Setup chooses from 4 fixed templates (kirana, sabzi, tailor, food stall). It can filter items and set each item's unit and buying price, but cannot add new items by voice. To set multiple values, name each item and separate them with "aur", "and", "आणि" or commas.
- Starting a new setup requires confirmation because it replaces existing entries, including synced data. The new shop starts with zero stock; enter existing stock as purchases. The initial demonstration shop still has sample stock.
- Corrections can change the amount, quantity or item. Changing the entry *type* by voice means cancelling and speaking again.
- When one total is given for several items (for example "dono saath mein 280"), the app asks for each item's amount separately rather than guessing how to split it.
- When a quantity is said without a unit, the app uses the configured template unit and displays it on the confirmation card; check it before saving.
- The 8 pm prompt requires the app to be open. Browsers may block speech output until the user has tapped the page; the on-screen prompt still appears.
- Local data can be lost when browser data is cleared. Account sync is optional and is not a substitute for server backups.
- Undoing a stock purchase restores derived stock but does not restore the item's previous buying price; check the price before later sales.
- Avoid editing the same local shop in multiple tabs at once; each tab holds its own in-memory copy.
- The PWA icon is an SVG, so some Android versions may show a generic install icon.
- Accents and very noisy shops can still defeat recognition. The quick-pick buttons and typed input are the fallback.
