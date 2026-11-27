/*
 * MeriDukaan - app.js
 * UI + conversation state machine. All totals come from Calc (calc.js);
 * all understanding comes from Parser (parser.js). Nothing is saved without "haan".
 */
(function () {
  'use strict';

  var STORE_KEY = 'meridukaan.v1';
  var SILENCE_MS = 8000;
  var MIN_CONFIDENCE = 0.7;
  var CFG = window.MERIDUKAAN_CONFIG || {};
  var UNIT_SAY = { kg: 'kilo', litre: 'litre', packet: 'packet', piece: 'piece' };
  var TYPE_LABEL = { sale: 'Bikri', purchase: 'Maal aaya', expense: 'Kharcha' };
  var TYPE_SAY = { sale: 'bikri', purchase: 'maal aaya', expense: 'kharcha' };

  var $ = function (id) { return document.getElementById(id); };

  // ---------- storage ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.items) && Array.isArray(d.entries) && d.settings) return d;
      }
    } catch (e) { /* corrupted storage: fall back to seed data */ }
    return Data.freshDb('kirana', Date.now(), true);
  }

  var db = load();

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); return true; }
    catch (e) { setReply('Phone mein jagah kam hai, entry save nahi hui.'); return false; }
  }

  // ---------- conversation state ----------
  var S = {
    mode: 'idle',      // idle | confirm | edit | ask | choose | undo | report | setup
    cards: [],
    ask: null,         // { index, field }
    choose: null,      // { ids, onPick }
    setup: null,
    fails: 0,
    tab: 'sales',
    quickType: 'sale',
    lastReply: ''
  };

  function itemById(id) {
    for (var i = 0; i < db.items.length; i++) if (db.items[i].id === id) return db.items[i];
    return null;
  }
  function unitSay(it) { return it ? (UNIT_SAY[it.unit] || it.unit) : ''; }
  function catLabel(c) { return Data.CATEGORY_LABELS[c] || Data.CATEGORY_LABELS.other; }
  function catSay(c) { return catLabel(c).replace(/\s*\(.*\)/, ''); }
  function num(n) { return Calc.formatNumber(n); }
  function rupees(n) { return Calc.formatNumber(n) + ' rupaye'; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function today() { return Calc.dayKey(Date.now()); }
  function todayEntries() { return Calc.entriesOn(db.entries, today()); }
  function stock() { return Calc.stockLevels(db.items, db.entries); }

  // ---------- speech output ----------
  var voices = [];
  function loadVoices() { try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
  if (window.speechSynthesis) {
    loadVoices();
    if ('onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged = loadVoices;
  }

  // Replies are Hinglish; a Hindi voice reads them best (English voice for English).
  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    try {
      speechSynthesis.cancel();
      var lang = db.settings.lang === 'en-IN' ? 'en-IN' : 'hi-IN';
      var u = new SpeechSynthesisUtterance(text.replace(/₹/g, ''));
      u.lang = lang;
      var v = voices.filter(function (x) { return x.lang && x.lang.replace('_', '-') === lang; })[0] ||
        voices.filter(function (x) { return x.lang && /-IN$/i.test(x.lang.replace('_', '-')); })[0];
      if (v) u.voice = v;
      u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch (e) { /* speech output is optional */ }
  }

  function setReply(text) {
    S.lastReply = text;
    $('reply').textContent = text;
  }

  function say(text) {
    setReply(text);
    speak(text);
  }

  // ---------- describing cards ----------
  function cardSpeech(c) {
    if (c.type === 'expense') return 'Kharcha, ' + catSay(c.category) + ', ' + rupees(c.amount);
    var it = itemById(c.itemId);
    return num(c.qty) + ' ' + unitSay(it) + ' ' + it.say + ', ' + rupees(c.amount) + ', ' + TYPE_SAY[c.type];
  }

  function entrySpeech(e) {
    if (e.type === 'expense') return 'kharcha ' + catSay(e.category) + ', ' + rupees(e.amount);
    var it = itemById(e.itemId);
    return num(e.qty) + ' ' + unitSay(it) + ' ' + (it ? it.say : e.itemId) + ', ' + rupees(e.amount) + ', ' + TYPE_SAY[e.type];
  }

  // ---------- the flow: check each draft card, ask for what is missing, then confirm ----------
  function proceed() {
    for (var i = 0; i < S.cards.length; i++) {
      var c = S.cards[i];
      if (c.type !== 'expense') {
        if (!c.itemId) {
          var hasCands = c.candidates && c.candidates.length;
          var ids = hasCands ? c.candidates : db.items.map(function (x) { return x.id; });
          return askChoose(ids, pickInto(c), hasCands ? null : (c.type === 'sale' ? 'Kya becha?' : 'Kaun sa maal aaya?'));
        }
        var it = itemById(c.itemId);
        if (c.qty == null) return askField(i, 'qty', 'Kitne ' + unitSay(it) + ' ' + it.say + '?');
        if (c.amount == null) {
          return askField(i, 'amount', c.type === 'sale'
            ? num(c.qty) + ' ' + unitSay(it) + ' ' + it.say + ', kitne rupaye mein?'
            : num(c.qty) + ' ' + unitSay(it) + ' ' + it.say + ' ke kitne rupaye diye?');
        }
      } else if (c.amount == null) {
        return askField(i, 'amount', catSay(c.category) + ' ke liye kitne rupaye?');
      }
      if (!c.forced) {
        var p = Calc.checkPlausible(c, itemById(c.itemId));
        if (!p.ok) return warnImplausible(i, p);
      }
    }
    S.mode = 'confirm';
    render();
    say(S.cards.map(cardSpeech).join('. ') + '. Sahi hai?');
  }

  function pickInto(card) {
    return function (id) {
      card.itemId = id;
      card.candidates = null;
      if (card.qtyUnit && card.qty != null) card.qty = Parser.convertQty(card.qty, card.qtyUnit, itemById(id));
      proceed();
    };
  }

  function warnImplausible(i, p) {
    var c = S.cards[i];
    var it = itemById(c.itemId);
    var what = c.type === 'expense' ? catSay(c.category) : num(c.qty) + ' ' + unitSay(it) + ' ' + it.say;
    var msg;
    if (p.field === 'qty') {
      c.warned = { field: 'qty', value: c.qty };
      msg = num(c.qty) + ' ' + unitSay(it) + ' bahut zyada lagta hai. Sahi matra phir se boliye.';
      c.qty = null;
    } else {
      c.warned = { field: 'amount', value: c.amount };
      var how = p.reason === 'amount_low' ? 'bahut kam' : 'bahut zyada';
      msg = Calc.formatINR(c.amount) + ' ' + what + ' ke liye ' + how + ' lagta hai. Sahi rakam phir se boliye.';
      c.amount = null;
    }
    S.mode = 'ask';
    S.ask = { index: i, field: p.field };
    render();
    say(msg);
  }

  function askField(i, field, prompt) {
    S.mode = 'ask';
    S.ask = { index: i, field: field };
    render();
    say(prompt);
  }

  function askChoose(ids, onPick, prompt) {
    S.mode = 'choose';
    S.choose = { ids: ids.slice(), onPick: onPick };
    render();
    if (!prompt) {
      var names = ids.slice(0, 3).map(function (id) { var it = itemById(id); return it ? it.say : id; });
      prompt = cap(names.join(' ya ')) + '?';
    }
    say(prompt);
  }

  function commit() {
    var now = Date.now();
    var saved = [];
    S.cards.forEach(function (c, k) {
      var e = { id: 'e' + (db.nextId++), ts: now + k, type: c.type, amount: Calc.round2(c.amount) };
      if (c.type === 'expense') e.category = c.category || 'other';
      else {
        var it = itemById(c.itemId);
        e.itemId = c.itemId;
        e.qty = Calc.round3(c.qty);
        if (c.type === 'sale') e.unitCost = it.buy;
        // Latest purchase rate becomes the buying price for future sales.
        if (c.type === 'purchase' && c.qty > 0) it.buy = Calc.round2(c.amount / c.qty);
      }
      db.entries.push(e);
      saved.push(e);
    });
    persist();
    S.cards = [];
    S.mode = 'idle';
    var lv = stock();
    var msg = saved.length > 1 ? saved.length + ' entry save ho gayi.' : 'Save ho gaya.';
    saved.forEach(function (e) {
      var it = itemById(e.itemId);
      if (it && !it.service && e.type !== 'expense') {
        var left = lv[it.id];
        msg += ' ' + cap(it.say) + ' ab ' + num(left) + ' ' + unitSay(it) + ' bacha.';
        if (left < 0) msg += ' Stock minus mein hai, maal entry check karein.';
        else if (Calc.isLowStock(it, left)) msg += ' Stock kam hai!';
      }
    });
    S.tab = saved[0].type === 'expense' ? 'expenses' : saved[0].type === 'purchase' ? 'stock' : 'sales';
    render();
    say(msg);
  }

  function cancelAll(msg) {
    S.cards = [];
    S.mode = 'idle';
    S.ask = null;
    S.choose = null;
    S.setup = null;
    render();
    say(msg || 'Theek hai, kuch save nahi kiya.');
  }

  function applyCorrection(corr) {
    var idx = S.cards.length - 1;
    var sameItem = false;
    if (corr.itemId) {
      for (var k = 0; k < S.cards.length; k++) {
        if (S.cards[k].itemId === corr.itemId) { idx = k; sameItem = true; break; }
      }
    }
    var c = S.cards[idx];
    if (corr.type && corr.type !== c.type && c.type !== 'expense') c.type = corr.type;
    if (corr.itemId && !sameItem && c.type !== 'expense') { c.itemId = corr.itemId; c.candidates = null; }
    else if (corr.candidates && !corr.itemId && c.type !== 'expense') { c.itemId = null; c.candidates = corr.candidates; }
    if (corr.qty != null && c.type !== 'expense') {
      c.qtyUnit = corr.qtyUnit;
      c.qty = Parser.convertQty(corr.qty, corr.qtyUnit, itemById(c.itemId));
      c.forced = false;
    }
    if (corr.amount != null) { c.amount = corr.amount; c.forced = false; }
    if (corr.category && c.type === 'expense') c.category = corr.category;
  }

  // ---------- answering questions ----------
  function profitReply() {
    var s = Calc.profitSummary(todayEntries(), db.items);
    var head = s.profit >= 0
      ? 'Aaj ka munafa ' + rupees(s.profit) + ' hua.'
      : 'Aaj ' + rupees(-s.profit) + ' ka nuksaan hua.';
    return head + ' Bikri ' + rupees(s.sales) + ', bechi cheezon ki laagat ' + rupees(s.cost) +
      ', kharcha ' + rupees(s.expenses) + '.';
  }

  function stockReply(id) {
    var it = itemById(id);
    if (!it) return 'Ye cheez list mein nahi hai.';
    if (it.service) return cap(it.say) + ' ka stock nahi rakha jaata.';
    var left = stock()[id];
    var msg = cap(it.say) + ' ke ' + num(left) + ' ' + unitSay(it) + ' bache hain.';
    if (Calc.isLowStock(it, left)) msg += ' Stock kam hai, maal mangwa lijiye.';
    return msg;
  }

  function lowStockReply() {
    var low = Calc.lowStockItems(db.items, db.entries);
    if (!low.length) return 'Sab cheezon ka stock theek hai.';
    var lv = stock();
    return 'Kam stock: ' + low.map(function (it) { return it.say + ' ' + num(lv[it.id]) + ' ' + unitSay(it); }).join(', ') + '.';
  }

  function reportReply() {
    var s = Calc.profitSummary(todayEntries(), db.items);
    return 'Aaj ka hisaab: bikri ' + rupees(s.sales) + ', maal ki laagat ' + rupees(s.cost) + ', kharcha ' +
      rupees(s.expenses) + '. ' + (s.profit >= 0 ? 'Munafa ' + rupees(s.profit) + '.' : 'Nuksaan ' + rupees(-s.profit) + '.') +
      (s.purchases ? ' Aaj ' + rupees(s.purchases) + ' ka maal aaya.' : '');
  }

  // ---------- input handling ----------
  function handle(text) {
    text = String(text || '').trim();
    if (!text) return;
    $('transcript').textContent = text;
    $('transcript').classList.remove('muted');

    if (S.mode === 'setup') return setupStep(text);
    if (S.mode !== 'idle' && Parser.isCancel(text) && S.mode !== 'confirm') return cancelAll();

    switch (S.mode) {
      case 'confirm': return onConfirm(text);
      case 'edit': return onEdit(text);
      case 'ask': return onAsk(text);
      case 'choose': return onChoose(text);
      case 'undo': return onUndoAnswer(text);
      case 'report': return onReportAnswer(text);
      default: return onIdle(text);
    }
  }

  function onIdle(text) {
    var r = Parser.parse(text, db.items);
    switch (r.intent) {
      case 'transaction':
        S.fails = 0;
        hideQuickPick();
        S.cards = r.cards;
        return proceed();
      case 'query_profit':
        S.fails = 0; S.tab = 'profit'; render();
        return say(profitReply());
      case 'report':
        S.fails = 0; S.tab = 'profit'; render();
        return say(reportReply());
      case 'query_sales':
        S.fails = 0; S.tab = 'sales'; render();
        return say('Aaj ki bikri ' + rupees(Calc.totalSales(todayEntries())) + ' hui.');
      case 'query_expense':
        S.fails = 0; S.tab = 'expenses'; render();
        return say('Aaj ka kharcha ' + rupees(Calc.totalExpenses(todayEntries())) + ' hua.');
      case 'query_stock':
        S.fails = 0; S.tab = 'stock'; render();
        if (r.itemId) return say(stockReply(r.itemId));
        if (r.candidates) {
          return askChoose(r.candidates, function (id) { S.mode = 'idle'; S.choose = null; render(); say(stockReply(id)); });
        }
        return say(lowStockReply());
      case 'undo':
        S.fails = 0;
        return startUndo();
      case 'setup':
        return startSetup();
      default:
        return notUnderstood();
    }
  }

  function notUnderstood() {
    S.fails++;
    say('Samajh nahi aaya. Aise boliye: "5 kilo chawal 300 rupaye mein beche".');
    if (S.fails >= 2) showQuickPick();
  }

  function onConfirm(text) {
    var r = Parser.parseConfirm(text, db.items);
    if (r.correction) { applyCorrection(r.correction); return proceed(); }
    if (r.answer === 'yes') return commit();
    if (r.answer === 'no') {
      S.mode = 'edit';
      render();
      return say('Kya badalna hai?');
    }
    if (r.cancel) return cancelAll();
    say('"Haan" ya "nahi" boliye. ' + S.cards.map(cardSpeech).join('. ') + '. Sahi hai?');
  }

  function onEdit(text) {
    var r = Parser.parseConfirm(text, db.items);
    if (r.correction) { applyCorrection(r.correction); return proceed(); }
    if (r.answer === 'yes') return proceed();
    if (r.answer === 'no' || r.cancel) return cancelAll('Theek hai, entry cancel kar di.');
    say('Jaise boliye: "400 rupaye" ya "6 kilo" ya cheez ka naam.');
  }

  function onAsk(text) {
    var c = S.cards[S.ask.index];
    var field = S.ask.field;
    var q = Parser.parseQuantity(text);
    if (!q) {
      // The user may have named the item or said "nahi"; treat it like a correction.
      var r = Parser.parseConfirm(text, db.items);
      if (r.correction && (r.correction.itemId || r.correction.candidates)) { applyCorrection(r.correction); return proceed(); }
      return say(field === 'qty' ? 'Matra number mein boliye, jaise "paanch kilo".' : 'Rakam boliye, jaise "teen sau rupaye".');
    }
    if (field === 'qty') {
      c.qty = Parser.convertQty(q.value, q.unit, itemById(c.itemId));
      if (c.warned && c.warned.field === 'qty' && c.warned.value === c.qty) c.forced = true;
    } else {
      c.amount = q.value;
      // Saying the same "odd" amount again means the shopkeeper is sure.
      if (c.warned && c.warned.field === 'amount' && c.warned.value === c.amount) c.forced = true;
    }
    S.ask = null;
    proceed();
  }

  function onChoose(text) {
    var id = Parser.pickCandidate(text, S.choose.ids, db.items);
    if (!id) {
      var names = S.choose.ids.slice(0, 3).map(function (x) { var it = itemById(x); return it ? it.say : x; });
      return say('Button dabaiye ya naam boliye: ' + names.join(' ya ') + '?');
    }
    var cb = S.choose.onPick;
    S.choose = null;
    cb(id);
  }

  function lastEntry() {
    return db.entries.length ? db.entries[db.entries.length - 1] : null;
  }

  function startUndo() {
    var last = lastEntry();
    if (!last) return say('Hatane ke liye koi entry nahi hai.');
    S.mode = 'undo';
    S.undoId = last.id;
    render();
    say('Pichhli entry: ' + entrySpeech(last) + '. Ise hatana hai?');
  }

  function onUndoAnswer(text) {
    var a = Parser.yesNo(text);
    if (a === 'yes') {
      db.entries = db.entries.filter(function (e) { return e.id !== S.undoId; });
      persist();
      S.mode = 'idle';
      render();
      return say('Pichhli entry hata di.');
    }
    if (a === 'no') { S.mode = 'idle'; render(); return say('Theek hai, entry nahi hatayi.'); }
    say('"Haan" ya "nahi" boliye. Pichhli entry hatani hai?');
  }

  // ---------- evening prompt (8 pm) ----------
  function checkEvening(force) {
    var now = new Date();
    if (!force && (now.getHours() < 20 || db.settings.eveningAsked === today())) return;
    if (S.mode !== 'idle' || listening) return;
    db.settings.eveningAsked = today();
    persist();
    S.mode = 'report';
    render();
    say('Aaj ka hisaab sunna chahenge?');
  }

  function onReportAnswer(text) {
    var a = Parser.yesNo(text);
    if (a === 'yes') { S.mode = 'idle'; S.tab = 'profit'; render(); return say(reportReply()); }
    if (a === 'no') { S.mode = 'idle'; render(); return say('Theek hai. Shubh ratri!'); }
    say('"Haan" ya "nahi" boliye. Aaj ka hisaab sunna chahenge?');
  }

  // ---------- voice setup: describe shop + up to 3 follow-ups, fills a fixed template ----------
  function startSetup() {
    S.cards = [];
    S.mode = 'setup';
    S.setup = { step: 0 };
    render();
    say('Apni dukaan ke baare mein bataiye. Aap kya bechte hain?');
  }

  function setupStep(text) {
    var st = S.setup;
    if (Parser.isCancel(text) && !Parser.isSkip(text)) return cancelAll('Setup band kiya. Purana data waisa hi hai.');
    if (st.step === 0) {
      var tpl = Data.TEMPLATES[Parser.matchTemplate(text, Data.TEMPLATES)];
      st.tpl = tpl.id;
      st.items = Data.clone(tpl.items);
      st.step = 1;
      render();
      return say(tpl.label + ' ka template mila. Mukhya cheezein kaun si hain? Sab chahiye to "sab" boliye.');
    }
    if (st.step === 1) {
      var ids = Parser.mentionedItems(text, st.items);
      if (ids.length && !Parser.isSkip(text)) st.items = st.items.filter(function (it) { return ids.indexOf(it.id) >= 0; });
      st.step = 2;
      render();
      var first = st.items[0];
      if (first.service) { st.step = 3; return say(cap(first.say) + ' ka kharcha, ek piece ka, kitna aata hai?'); }
      return say(cap(first.say) + ' kis unit mein bechte hain? Kilo, litre, packet ya piece?');
    }
    if (st.step === 2) {
      var u = Parser.parseUnitWord(text);
      if (u) st.items[0].unit = u;
      st.step = 3;
      render();
      return say('Ek ' + (UNIT_SAY[st.items[0].unit] || st.items[0].unit) + ' ' + st.items[0].say + ' kitne mein khareedte hain?');
    }
    if (st.step === 3) {
      var n = Parser.parseNumber(text);
      var it0 = st.items[0];
      if ((n == null || n <= 0) && !Parser.isSkip(text) && !st.priceAsked) {
        st.priceAsked = true;
        return say('Daam samajh nahi aaya. Ek ' + (UNIT_SAY[it0.unit] || it0.unit) + ' ' + it0.say + ' ka kitna rupaya? Ya "skip" boliye.');
      }
      if (n != null && n > 0) {
        it0.buy = n;
        if (it0.sell <= n) it0.sell = Calc.round2(n * 1.2);
      }
      var lang = db.settings.lang;
      db = Data.freshDb(st.tpl, Date.now(), false);
      db.items = st.items;
      db.settings.lang = lang;
      db.settings.setupDone = true;
      persist();
      S.mode = 'idle';
      S.setup = null;
      S.tab = 'stock';
      render();
      say('Dukaan taiyaar! ' + st.items.length + ' cheezein: ' + st.items.map(function (x) { return x.say; }).join(', ') +
        '. Ab boliye, jaise "2 ' + unitSay(it0) + ' ' + it0.say + ' ' + Calc.expectedAmount(it0, 2, 'sale') + ' rupaye mein beche".');
    }
  }

  // ---------- speech recognition ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  var listening = false;
  var silenceTimer = null;

  function armSilence() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(onSilence, SILENCE_MS);
  }
  function clearSilence() { clearTimeout(silenceTimer); silenceTimer = null; }

  function onSilence() {
    stopListening(true);
    say('Boliye, main sun raha hoon.');
  }

  function setListeningUi(on) {
    listening = on;
    $('mic').classList.toggle('listening', on);
    $('mic').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('micLabel').textContent = on ? 'Sun raha hoon… (rokne ke liye dabaiye)' : 'Dabaiye aur boliye';
  }

  function recognitionFailed() {
    S.fails++;
    say('Awaaz saaf nahi aayi, phir se boliye.');
    $('noiseHint').classList.add('strong');
    if (S.fails >= 2) showQuickPick();
  }

  function startListening() {
    if (!SR) {
      say('Is browser mein bolkar entry nahi chalti. Neeche likhiye.');
      showFallback();
      return;
    }
    if (window.speechSynthesis) speechSynthesis.cancel();
    rec = new SR();
    rec.lang = db.settings.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;
    var gotFinal = false;

    rec.onstart = function () { setListeningUi(true); armSilence(); $('transcript').textContent = '…'; };
    rec.onresult = function (ev) {
      armSilence();
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var res = ev.results[i];
        if (res.isFinal) {
          gotFinal = true;
          var alt = res[0];
          // Some Android builds report 0 when confidence is unknown; treat that as "not reported".
          var conf = typeof alt.confidence === 'number' && alt.confidence > 0 ? alt.confidence : 1;
          $('transcript').textContent = alt.transcript + (conf < MIN_CONFIDENCE ? ' (?)' : '');
          stopListening(false);
          if (conf < MIN_CONFIDENCE) recognitionFailed();
          else {
            $('noiseHint').classList.remove('strong');
            handle(alt.transcript);
          }
          return;
        }
        interim += res[0].transcript;
      }
      if (interim) $('transcript').textContent = interim;
    };
    rec.onerror = function (e) {
      clearSilence();
      var err = e && e.error;
      if (err === 'no-speech') { if (!gotFinal) say('Boliye, main sun raha hoon.'); }
      else if (err === 'aborted') { /* stopped by us */ }
      else if (err === 'not-allowed' || err === 'service-not-allowed') {
        say('Mic ki permission nahi mili. Neeche likhkar entry kijiye.');
        showFallback();
      } else if (err === 'network') {
        say('Awaaz pehchanne ke liye internet chahiye. Abhi neeche likhkar entry kijiye.');
        showFallback();
      } else recognitionFailed();
    };
    rec.onend = function () { clearSilence(); setListeningUi(false); };
    try { rec.start(); }
    catch (e) { setListeningUi(false); recognitionFailed(); }
  }

  function stopListening(abort) {
    clearSilence();
    if (rec) {
      try { if (abort) rec.abort(); else rec.stop(); } catch (e) { /* already stopped */ }
    }
    setListeningUi(false);
  }

  function showFallback() {
    var f = $('typeForm');
    f.classList.add('highlight');
    $('typeInput').focus();
  }

  function showQuickPick() {
    $('quickPick').hidden = false;
    renderQuickPick();
    showFallback();
  }
  function hideQuickPick() {
    $('quickPick').hidden = true;
    $('typeForm').classList.remove('highlight');
  }

  // ---------- rendering ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(cls, text, onClick) {
    var b = el('button', 'btn ' + (cls || ''), text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function renderCards() {
    var box = $('cards');
    box.innerHTML = '';
    var mode = S.mode;
    if (mode === 'undo') {
      var last = lastEntry();
      box.appendChild(el('p', 'card-msg', 'Pichhli entry hatani hai?'));
      if (last) box.appendChild(entryCard(last));
      box.appendChild(yesNoActions('Haan, hatao', 'Nahi'));
      return;
    }
    if (mode === 'report') {
      box.appendChild(el('p', 'card-msg', '🌙 Aaj ka hisaab sunna chahenge?'));
      box.appendChild(yesNoActions('Haan, sunao', 'Nahi'));
      return;
    }
    if (mode === 'setup') {
      var steps = ['Dukaan ke baare mein bataiye', 'Mukhya cheezein (ya "sab")', 'Unit: kilo / litre / packet / piece', 'Khareed daam'];
      box.appendChild(el('p', 'card-msg', '🏪 Setup ' + (S.setup.step + 1) + '/4: ' + steps[S.setup.step]));
      var acts = el('div', 'actions');
      if (S.setup.step === 0) {
        Object.keys(Data.TEMPLATES).forEach(function (id) {
          acts.appendChild(button('ghost', Data.TEMPLATES[id].label, function () { handle(Data.TEMPLATES[id].keywords[0]); }));
        });
      } else if (S.setup.step === 1) {
        acts.appendChild(button('ghost', 'Sab', function () { handle('sab'); }));
      } else if (S.setup.step === 2) {
        ['kilo', 'litre', 'packet', 'piece'].forEach(function (u) { acts.appendChild(button('ghost', u, function () { handle(u); })); });
      }
      acts.appendChild(button('no', 'Setup band', function () { cancelAll('Setup band kiya. Purana data waisa hi hai.'); }));
      box.appendChild(acts);
      return;
    }
    if (!S.cards.length) return;

    var title = { confirm: 'Sahi hai?', edit: 'Kya badalna hai?', ask: 'Jaankari chahiye', choose: 'Kaun si cheez?' }[mode] || '';
    box.appendChild(el('p', 'card-msg', title));
    S.cards.forEach(function (c, i) { box.appendChild(draftCard(c, i)); });

    var actions = el('div', 'actions');
    if (mode === 'confirm') {
      actions.appendChild(button('yes', '✔ Haan, sahi hai', function () { handle('haan'); }));
      actions.appendChild(button('no', '✘ Nahi', function () { handle('nahi'); }));
    } else if (mode === 'edit') {
      var target = S.cards.length - 1;
      var tc = S.cards[target];
      actions.appendChild(button('', 'Rakam badlo', function () { askField(target, 'amount', 'Sahi rakam boliye.'); }));
      if (tc.type !== 'expense') actions.appendChild(button('', 'Matra badlo', function () { askField(target, 'qty', 'Sahi matra boliye.'); }));
      actions.appendChild(button('no', 'Cancel', function () { cancelAll('Theek hai, entry cancel kar di.'); }));
    } else if (mode === 'choose' && S.choose) {
      S.choose.ids.slice(0, mode === 'choose' && S.choose.ids.length > 3 ? 12 : 3).forEach(function (id) {
        var it = itemById(id);
        actions.appendChild(button('cand', it ? it.name : id, function () { var cb = S.choose.onPick; S.choose = null; cb(id); }));
      });
      actions.appendChild(button('no', 'Cancel', function () { cancelAll(); }));
    } else if (mode === 'ask' && S.ask) {
      var c = S.cards[S.ask.index];
      if (S.ask.field === 'amount' && c.type !== 'expense' && c.qty != null && !c.warned) {
        var exp = Calc.expectedAmount(itemById(c.itemId), c.qty, c.type);
        if (exp > 0) actions.appendChild(button('ghost', Calc.formatINR(exp) + ' (rate se)', function () { handle(String(exp)); }));
      }
      actions.appendChild(button('no', 'Cancel', function () { cancelAll(); }));
    }
    box.appendChild(actions);
  }

  function yesNoActions(yesText, noText) {
    var a = el('div', 'actions');
    a.appendChild(button('yes', '✔ ' + yesText, function () { handle('haan'); }));
    a.appendChild(button('no', '✘ ' + noText, function () { handle('nahi'); }));
    return a;
  }

  function draftCard(c, i) {
    var row = el('div', 'card');
    row.appendChild(el('span', 'type ' + c.type, TYPE_LABEL[c.type]));
    var mid = el('div');
    var it = itemById(c.itemId);
    var whatText = c.type === 'expense' ? catLabel(c.category)
      : it ? it.name
      : c.candidates ? (c.heard ? '"' + c.heard + '" ?' : '?') : 'Cheez?';
    mid.appendChild(el('div', 'what', whatText));
    if (c.type !== 'expense') {
      var q = el('div', 'qty');
      if (c.qty == null) q.appendChild(el('span', 'missing', 'matra ?'));
      else q.textContent = num(c.qty) + ' ' + (it ? it.unit : '');
      mid.appendChild(q);
    }
    row.appendChild(mid);
    var amt = el('div', 'amt');
    if (c.amount == null) amt.appendChild(el('span', 'missing', '₹ ?'));
    else amt.textContent = Calc.formatINR(c.amount);
    row.appendChild(amt);
    if (c.type === 'sale' && it && !it.service && c.qty != null) {
      var left = stock()[it.id];
      if (c.qty > left) row.appendChild(el('div', 'note', '⚠ Stock mein sirf ' + num(left) + ' ' + it.unit + ' hai'));
    }
    if (c.warned && c.forced) row.appendChild(el('div', 'note', '⚠ Aapne dobara yahi bola, isliye maan liya'));
    return row;
  }

  function entryCard(e) {
    var row = el('div', 'card');
    row.appendChild(el('span', 'type ' + e.type, TYPE_LABEL[e.type]));
    var it = itemById(e.itemId);
    var mid = el('div');
    mid.appendChild(el('div', 'what', e.type === 'expense' ? catLabel(e.category) : (it ? it.name : e.itemId)));
    if (e.type !== 'expense') mid.appendChild(el('div', 'qty', num(e.qty) + ' ' + (it ? it.unit : '')));
    row.appendChild(mid);
    row.appendChild(el('div', 'amt', Calc.formatINR(e.amount)));
    return row;
  }

  function renderQuickPick() {
    var types = $('quickTypes').querySelectorAll('.chip');
    Array.prototype.forEach.call(types, function (b) { b.classList.toggle('on', b.getAttribute('data-type') === S.quickType); });
    var grid = $('quickItems');
    grid.innerHTML = '';
    if (S.quickType === 'expense') {
      Object.keys(Data.CATEGORY_LABELS).forEach(function (cat) {
        grid.appendChild(button('', Data.CATEGORY_LABELS[cat], function () {
          S.cards = [{ type: 'expense', category: cat, amount: null, itemId: null }];
          proceed();
        }));
      });
      return;
    }
    db.items.forEach(function (it) {
      if (S.quickType === 'purchase' && it.service) return;
      grid.appendChild(button('', it.name, function () {
        S.cards = [{ type: S.quickType, itemId: it.id, qty: null, amount: null }];
        proceed();
      }));
    });
  }

  function timeOf(ts) {
    var d = new Date(ts);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function entryRow(e) {
    var li = el('li');
    li.appendChild(el('span', 'time', timeOf(e.ts)));
    var it = itemById(e.itemId);
    var what = e.type === 'expense' ? catLabel(e.category)
      : (it ? it.name : e.itemId) + ' · ' + num(e.qty) + ' ' + (it ? it.unit : '');
    li.appendChild(el('span', '', what));
    li.appendChild(el('span', 'amt', Calc.formatINR(e.amount)));
    return li;
  }

  function totalBox(label, value) {
    var d = el('div', 'total');
    d.appendChild(el('span', '', label));
    d.appendChild(el('span', 'big', value));
    return d;
  }

  function listOf(entries, emptyText) {
    if (!entries.length) return el('p', 'empty', emptyText);
    var ul = el('ul', 'list');
    entries.slice().sort(function (a, b) { return b.ts - a.ts; }).forEach(function (e) { ul.appendChild(entryRow(e)); });
    return ul;
  }

  function renderPanel() {
    var p = $('panel');
    p.innerHTML = '';
    var tE = todayEntries();
    if (S.tab === 'sales') {
      var sales = tE.filter(function (e) { return e.type === 'sale'; });
      p.appendChild(totalBox('Aaj ki bikri (' + sales.length + ')', Calc.formatINR(Calc.totalSales(tE))));
      p.appendChild(listOf(sales, 'Aaj abhi tak koi bikri nahi.'));
    } else if (S.tab === 'expenses') {
      var ex = tE.filter(function (e) { return e.type === 'expense'; });
      p.appendChild(totalBox('Aaj ka kharcha', Calc.formatINR(Calc.totalExpenses(tE))));
      p.appendChild(listOf(ex, 'Aaj koi kharcha nahi.'));
    } else if (S.tab === 'stock') {
      var lv = stock();
      var ul = el('ul', 'list');
      db.items.forEach(function (it) {
        var li = el('li');
        var low = Calc.isLowStock(it, lv[it.id]);
        if (low) li.className = 'low';
        li.appendChild(el('span', 'time', '₹' + Calc.formatNumber(it.buy) + '→' + Calc.formatNumber(it.sell)));
        var name = el('span', '', it.name);
        if (low) name.appendChild(el('span', 'tag', 'KAM'));
        li.appendChild(name);
        li.appendChild(el('span', 'amt', it.service ? 'seva' : num(lv[it.id]) + ' ' + it.unit));
        ul.appendChild(li);
      });
      p.appendChild(ul);
      var pur = tE.filter(function (e) { return e.type === 'purchase'; });
      p.appendChild(el('h3', '', 'Aaj aaya maal: ' + Calc.formatINR(Calc.totalPurchases(tE))));
      p.appendChild(listOf(pur, 'Aaj koi maal nahi aaya.'));
    } else {
      var s = Calc.profitSummary(tE, db.items);
      var big = el('div', 'profit-big' + (s.profit < 0 ? ' loss' : ''));
      big.appendChild(el('div', '', s.profit < 0 ? 'Aaj ka nuksaan' : 'Aaj ka munafa'));
      big.appendChild(el('div', 'val', Calc.formatINR(s.profit)));
      p.appendChild(big);
      var t = el('table', 'breakdown');
      [['Bikri (Sales)', '+ ' + Calc.formatINR(s.sales)],
        ['Bechi cheezon ki khareed (Cost)', '− ' + Calc.formatINR(s.cost)],
        ['Kharcha (Expenses)', '− ' + Calc.formatINR(s.expenses)],
        ['Munafa (Profit)', Calc.formatINR(s.profit)]].forEach(function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', '', r[0]));
        tr.appendChild(el('td', '', r[1]));
        t.appendChild(tr);
      });
      p.appendChild(t);
      p.appendChild(el('p', 'formula', 'Munafa = Bikri − bechi cheezon ki khareed keemat − kharcha. Maal kharidna (stock) munafa tab ghatata hai jab woh bikta hai.'));
      p.appendChild(el('h3', '', 'Pichhle 7 din'));
      var ul7 = el('ul', 'list');
      Calc.dailyHistory(db.entries, db.items, Date.now(), 7).forEach(function (d) {
        var li = el('li');
        li.appendChild(el('span', 'time', d.key.slice(5)));
        li.appendChild(el('span', '', 'Bikri ' + Calc.formatINR(d.sales)));
        li.appendChild(el('span', 'amt', Calc.formatINR(d.profit)));
        ul7.appendChild(li);
      });
      p.appendChild(ul7);
    }
  }

  function renderTabs() {
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (b) {
      var on = b.getAttribute('data-tab') === S.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderSettings() {
    var tpl = Data.TEMPLATES[db.settings.template] || Data.TEMPLATES.kirana;
    $('shopName').textContent = 'Template: ' + tpl.label + ' · ' + db.items.length + ' cheezein · ' + db.entries.length + ' entries';
    var key = (CFG.AI_API_KEY || '').trim();
    $('aiStatus').textContent = key
      ? 'Optional AI key set hai. Hisaab phir bhi sirf calc.js ke fixed rules se hota hai.'
      : 'Optional AI helper: key not set. App poori tarah built-in rules se chalta hai (koi key zaroori nahi).';
  }

  function render() {
    renderCards();
    renderTabs();
    renderPanel();
    renderSettings();
    if (!$('quickPick').hidden) renderQuickPick();
  }

  // ---------- online / offline ----------
  function updateOnline() {
    $('offlineBadge').hidden = navigator.onLine !== false;
  }

  // ---------- wiring ----------
  function init() {
    $('lang').value = db.settings.lang || 'hi-IN';
    $('lang').addEventListener('change', function () {
      db.settings.lang = this.value;
      persist();
      document.documentElement.lang = this.value.slice(0, 2);
    });
    $('mic').addEventListener('click', function () {
      if (listening) stopListening(false);
      else startListening();
    });
    $('replay').addEventListener('click', function () { speak(S.lastReply); });
    $('typeForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = $('typeInput').value;
      $('typeInput').value = '';
      handle(v);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-say]'), function (b) {
      b.addEventListener('click', function () {
        if (S.mode !== 'idle') cancelAll('Pichhli adhoori entry cancel ki.');
        handle(b.getAttribute('data-say'));
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.addEventListener('click', function () { S.tab = b.getAttribute('data-tab'); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#quickTypes .chip'), function (b) {
      b.addEventListener('click', function () { S.quickType = b.getAttribute('data-type'); renderQuickPick(); });
    });
    $('setupBtn').addEventListener('click', startSetup);
    $('resetBtn').addEventListener('click', function () {
      if (!window.confirm('Saari entries hata kar sample data wapas laayein?')) return;
      var lang = db.settings.lang;
      db = Data.freshDb('kirana', Date.now(), true);
      db.settings.lang = lang;
      persist();
      cancelAll('Sample data wapas aa gaya.');
    });
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    updateOnline();
    if (!SR) $('micLabel').textContent = 'Bolkar entry is browser mein nahi chalti - neeche likhiye';

    persist();
    render();

    setInterval(function () { checkEvening(false); }, 60000);
    var forceEvening = /[?&]evening=1\b/.test(location.search);
    setTimeout(function () { checkEvening(forceEvening); }, 1500);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
    }
  }

  // Exposed for manual testing from the browser console.
  window.MeriDukaan = { handle: handle, state: S, db: function () { return db; }, evening: function () { checkEvening(true); } };

  init();
})();
