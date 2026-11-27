# MeriDukaan — बोलो, हिसाब रखो

A voice-first, mobile-first PWA for small Indian shopkeepers (kirana, sabzi vendors, tailors, food stalls). You record sales, expenses and stock purchases by speaking Hindi, Marathi, Tamil or English, mixed in any way. The app also answers "Aaj ka munafa kitna hua?" out loud.

Hackathon prototype. Plain HTML, CSS and vanilla JS: no build step, no dependencies, **no API keys needed**.

## Run it (one command)

```bash
docker compose up
```

Then open **http://localhost:8080**.

The compose file serves `public/` with `nginx:alpine` on port 8080. The main screen loads with 8 seeded grocery items and sample entries.

Without Docker, any static server works, for example:

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
```

98 tests using Node's built-in `assert` (no npm install). They cover:

- number words (`teen sau`, `do hazaar`, `dedh`, `saade teen sau`, `paune do`, Devanagari/Tamil digits, `₹1,20,000`)
- parsing sales, expenses and purchases
- multiple items in one sentence
- fuzzy item matching (`chaval` → Chawal / Chana)
- missing quantity or amount
- implausible amounts
- yes/no and correction replies (`nahi, 400 hai`)
- profit and stock calculations, Indian number formatting, and template matching

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
| "Main kirana dukaan chalata hoon" (Setup button) | Up to 3 follow-ups (items, unit, buying price). Then a **fixed, pre-tested template** is filled in; no code is generated |

The rest of the screen:

- **Mic:** one large tap-to-talk button. The mic never listens on its own.
- **Feedback:** a live transcript line, a reply line that is also spoken (speechSynthesis) with a 🔁 replay button, and a typed fallback.
- **Tabs:** Sales / Expenses / Stock / Profit.
- **Accessibility:** buttons are at least 48 px with high contrast, and amounts use ₹ with Indian grouping (₹1,20,000).
- **Language selector:** sets the recognition locale (`hi-IN`, `mr-IN`, `ta-IN`, `en-IN`). One item matches across languages: *rice / chawal / tandul / arisi / चावल / அரிசி* are the same item.
- **8 pm prompt:** "Aaj ka hisaab sunna chahenge?" (once a day; add `?evening=1` to the URL to test it).

### When things go wrong

| Situation | Behaviour |
|---|---|
| Confidence < 0.7 or recognition error | Says "Awaaz saaf nahi aayi, phir se boliye." After 2 failures, shows tap-to-select item buttons and highlights the typed input |
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
  config.js       optional AI key (empty → "key not set"; nothing needs it)
  sw.js           offline cache
tests/tests.js    node:assert test suite
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
- Spoken and on-screen replies are in Hinglish (Roman Hindi) whatever language is selected. Only recognition, keywords and item names are multilingual.
- Setup chooses from 4 fixed templates (kirana, sabzi, tailor, food stall). It can filter items and change the first item's unit and buying price, but cannot add new items by voice.
- Corrections can change the amount, quantity or item. Changing the entry *type* by voice means cancelling and speaking again.
- Browsers may block speech output for the 8 pm prompt until the user has tapped the page; the on-screen prompt still appears.
- Data is stored on the device only (no sync or backup). Clearing browser data erases it.
- The PWA icon is an SVG, so some Android versions may show a generic install icon.
- Accents and very noisy shops can still defeat recognition. The quick-pick buttons and typed input are the fallback.
