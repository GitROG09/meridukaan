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

  function persist(trackSync) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
      if (trackSync !== false && window.ShopSync) ShopSync.changed();
      return true;
    }
    catch (e) { setReply('Phone mein jagah kam hai, entry save nahi hui.'); return false; }
  }

  // ---------- conversation state ----------
  var S = {
    mode: db.settings.languageChosen === false ? 'language' : 'idle',
    cards: [],
    ask: null,         // { index, field }
    choose: null,      // { ids, onPick }
    setup: null,
    fails: 0,
    tab: 'sales',
    quickType: 'sale',
    sharedTotal: false,
    lastReply: ''
  };

  function itemById(id) {
    for (var i = 0; i < db.items.length; i++) if (db.items[i].id === id) return db.items[i];
    return null;
  }
  function tr(hi, mr, en) {
    return db.settings.lang === 'mr-IN' ? mr : db.settings.lang === 'en-IN' ? en : hi;
  }
  var LOCAL_NAMES = {
    rice: ['तांदूळ', 'rice'], atta: ['पीठ', 'flour'], sugar: ['साखर', 'sugar'],
    dal: ['डाळ', 'lentils'], chana: ['चणा', 'chickpeas'], oil: ['तेल', 'oil'],
    biscuit: ['बिस्किट', 'biscuit'], milk: ['दूध', 'milk'], potato: ['बटाटा', 'potato'],
    onion: ['कांदा', 'onion'], tomato: ['टोमॅटो', 'tomato'], chilli: ['मिरची', 'chilli'],
    coriander: ['कोथिंबीर', 'coriander'], blouse: ['ब्लाउज', 'blouse'], pant: ['पँट', 'pants'],
    shirt: ['शर्ट', 'shirt'], kurta: ['कुर्ता', 'kurta'], thread: ['दोरा', 'thread'],
    button: ['बटण', 'button'], chai: ['चहा', 'tea'], coffee: ['कॉफी', 'coffee'],
    samosa: ['समोसा', 'samosa'], vadapav: ['वडापाव', 'vada pav'], poha: ['पोहे', 'poha'],
    water: ['पाण्याची बाटली', 'water bottle']
  };
  function itemSay(it) {
    if (!it) return '';
    var names = LOCAL_NAMES[it.id];
    return names ? tr(it.say, names[0], names[1]) : it.say;
  }
  function unitSay(it) {
    if (!it) return '';
    var units = { kg: ['किलो', 'kg'], litre: ['लिटर', 'litres'], packet: ['पाकीट', 'packets'], piece: ['नग', 'pieces'] };
    var u = units[it.unit];
    return u ? tr(UNIT_SAY[it.unit], u[0], u[1]) : it.unit;
  }
  function catLabel(c) { return Data.CATEGORY_LABELS[c] || Data.CATEGORY_LABELS.other; }
  function catSay(c) {
    var labels = { transport: ['वाहतूक', 'transport'], rent: ['भाडे', 'rent'], electricity: ['वीज', 'electricity'],
      salary: ['मजुरी', 'wages'], tea: ['चहापाणी', 'tea and snacks'], packing: ['पॅकिंग', 'packing'], other: ['इतर', 'other'] };
    var label = labels[c] || labels.other;
    return tr(catLabel(c).replace(/\s*\(.*\)/, ''), label[0], label[1]);
  }
  function num(n) { return Calc.formatNumber(n); }
  function rupees(n) { return Calc.formatNumber(n) + tr(' rupaye', ' रुपये', ' rupees'); }
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

  function speak(text) {
    if (!window.speechSynthesis || !text) return;
    try {
      speechSynthesis.cancel();
      var lang = db.settings.lang === 'ta-IN' ? 'hi-IN' : db.settings.lang;
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
    if (c.type === 'expense') return tr('Kharcha, ', 'खर्च, ', 'Expense, ') + catSay(c.category) + ', ' + rupees(c.amount);
    var it = itemById(c.itemId);
    var type = c.type === 'sale' ? tr('bikri', 'विक्री', 'sale') : tr('maal aaya', 'माल खरेदी', 'stock purchase');
    return num(c.qty) + ' ' + unitSay(it) + ' ' + itemSay(it) + ', ' + rupees(c.amount) + ', ' + type;
  }

  function entrySpeech(e) {
    if (e.type === 'expense') return tr('kharcha ', 'खर्च ', 'expense ') + catSay(e.category) + ', ' + rupees(e.amount);
    var it = itemById(e.itemId);
    var type = e.type === 'sale' ? tr('bikri', 'विक्री', 'sale') : tr('maal aaya', 'माल खरेदी', 'stock purchase');
    return num(e.qty) + ' ' + unitSay(it) + ' ' + (it ? itemSay(it) : e.itemId) + ', ' + rupees(e.amount) + ', ' + type;
  }

  // ---------- the flow: check each draft card, ask for what is missing, then confirm ----------
  function proceed() {
    for (var i = 0; i < S.cards.length; i++) {
      var c = S.cards[i];
      if (c.type !== 'expense') {
        if (!c.itemId) {
          var hasCands = c.candidates && c.candidates.length;
          var ids = hasCands ? c.candidates : db.items.map(function (x) { return x.id; });
          return askChoose(ids, pickInto(c), hasCands ? null : (c.type === 'sale'
            ? tr('Kya becha?', 'काय विकले?', 'What did you sell?')
            : tr('Kaun sa maal aaya?', 'कोणता माल खरेदी केला?', 'What stock did you purchase?')));
        }
        var it = itemById(c.itemId);
        if (c.qty == null) return askField(i, 'qty', tr('Kitne ', 'किती ', 'How many ') + unitSay(it) + ' ' + itemSay(it) + '?');
        if (c.amount == null) {
          var prefix = S.sharedTotal
            ? tr('Ek kul rakam ko baanta nahi ja sakta. Har cheez ka daam alag batayein. ', 'एकूण रक्कम वाटता येत नाही. प्रत्येक वस्तूची रक्कम वेगळी सांगा. ', 'I cannot split a shared total. Give each item’s amount separately. ')
            : '';
          S.sharedTotal = false;
          return askField(i, 'amount', prefix + (c.type === 'sale'
            ? num(c.qty) + ' ' + unitSay(it) + ' ' + itemSay(it) + tr(', kitne rupaye mein?', ', किती रुपयांना विकले?', ', sold for how many rupees?')
            : num(c.qty) + ' ' + unitSay(it) + ' ' + itemSay(it) + tr(' ke kitne rupaye diye?', ' साठी किती रुपये दिले?', ', purchased for how many rupees?')));
        }
      } else if (c.amount == null) {
        return askField(i, 'amount', catSay(c.category) + tr(' ke liye kitne rupaye?', ' साठी किती रुपये?', ': how many rupees?'));
      }
      if (!c.forced) {
        var p = Calc.checkPlausible(c, itemById(c.itemId));
        if (!p.ok) return warnImplausible(i, p);
      }
    }
    S.mode = 'confirm';
    render();
    say(S.cards.map(cardSpeech).join('. ') + tr('. Sahi hai?', '. बरोबर आहे का?', '. Is that correct?'));
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
    var what = c.type === 'expense' ? catSay(c.category) : num(c.qty) + ' ' + unitSay(it) + ' ' + itemSay(it);
    var msg;
    if (p.field === 'qty') {
      c.warned = { field: 'qty', value: c.qty };
      msg = num(c.qty) + ' ' + unitSay(it) + tr(' bahut zyada lagta hai. Sahi matra phir se boliye.', ' खूप जास्त वाटते. योग्य संख्या पुन्हा सांगा.', ' seems too high. Say the correct quantity again.');
      c.qty = null;
    } else {
      c.warned = { field: 'amount', value: c.amount };
      var how = p.reason === 'amount_low' ? tr('bahut kam', 'खूप कमी', 'too low') : tr('bahut zyada', 'खूप जास्त', 'too high');
      msg = Calc.formatINR(c.amount) + ' ' + what + tr(' ke liye ', ' साठी ', ' for ') + how +
        tr(' lagta hai. Sahi rakam phir se boliye.', ' वाटते. योग्य रक्कम पुन्हा सांगा.', '. Say the correct amount again.');
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
      var names = ids.slice(0, 3).map(function (id) { var it = itemById(id); return it ? itemSay(it) : id; });
      prompt = cap(names.join(tr(' ya ', ' की ', ' or '))) + '?';
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
    var msg = saved.length > 1 ? tr(saved.length + ' entry save ho gayi.', saved.length + ' नोंदी जतन झाल्या.', saved.length + ' entries saved.') : tr('Save ho gaya.', 'नोंद जतन झाली.', 'Entry saved.');
    saved.forEach(function (e) {
      var it = itemById(e.itemId);
      if (it && !it.service && e.type !== 'expense') {
        var left = lv[it.id];
        msg += ' ' + cap(itemSay(it)) + tr(' ab ', ' आता ', ' remaining: ') + num(left) + ' ' + unitSay(it) + '.';
        if (left < 0) msg += tr(' Stock minus mein hai, maal entry check karein.', ' साठा ऋण आहे, नोंदी तपासा.', ' Stock is negative; check the entries.');
        else if (Calc.isLowStock(it, left)) msg += tr(' Stock kam hai!', ' साठा कमी आहे!', ' Stock is low!');
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
    say(msg || tr('Theek hai, kuch save nahi kiya.', 'ठीक आहे, काहीही जतन केले नाही.', 'Nothing was saved.'));
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
      ? tr('Aaj ka munafa ', 'आजचा नफा ', 'Today’s profit is ') + rupees(s.profit) + '.'
      : tr('Aaj nuksaan ', 'आजचा तोटा ', 'Today’s loss is ') + rupees(-s.profit) + '.';
    return head + tr(' Bikri ', ' विक्री ', ' Sales ') + rupees(s.sales) +
      tr(', bechi cheezon ki laagat ', ', विकलेल्या मालाची खरेदी किंमत ', ', cost of goods sold ') + rupees(s.cost) +
      tr(', kharcha ', ', खर्च ', ', expenses ') + rupees(s.expenses) + '.';
  }

  function stockReply(id) {
    var it = itemById(id);
    if (!it) return tr('Ye cheez list mein nahi hai.', 'ही वस्तू यादीत नाही.', 'This item is not in the list.');
    if (it.service) return cap(itemSay(it)) + tr(' ka stock nahi rakha jaata.', ' चा साठा ठेवला जात नाही.', ' is a service; stock is not tracked.');
    var left = stock()[id];
    var msg = cap(itemSay(it)) + tr(' ke ', ' शिल्लक: ', ' remaining: ') + num(left) + ' ' + unitSay(it) + '.';
    if (Calc.isLowStock(it, left)) msg += tr(' Stock kam hai, maal mangwa lijiye.', ' साठा कमी आहे.', ' Stock is low.');
    return msg;
  }

  function lowStockReply() {
    var low = Calc.lowStockItems(db.items, db.entries);
    if (!low.length) return tr('Sab cheezon ka stock theek hai.', 'सर्व वस्तूंचा साठा पुरेसा आहे.', 'All stock levels are sufficient.');
    var lv = stock();
    return tr('Kam stock: ', 'कमी साठा: ', 'Low stock: ') + low.map(function (it) { return itemSay(it) + ' ' + num(lv[it.id]) + ' ' + unitSay(it); }).join(', ') + '.';
  }

  function reportReply() {
    var s = Calc.profitSummary(todayEntries(), db.items);
    return profitReply() + (s.purchases ? tr(' Aaj maal khareeda ', ' आज माल खरेदी ', ' Today’s stock purchases: ') + rupees(s.purchases) + '.' : '');
  }

  // ---------- input handling ----------
  function handle(text) {
    text = String(text || '').trim();
    if (!text) return;
    $('transcript').textContent = text;
    $('transcript').classList.remove('muted');

    if (S.mode === 'language') return chooseLanguage(text);
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

  function chooseLanguage(text) {
    var value = Parser.normalize(text);
    var language = /\b(hindi|hindee)\b|हिंदी|हिन्दी/.test(value) ? 'hi-IN'
      : /\bmarathi\b|मराठी/.test(value) ? 'mr-IN'
      : /\b(english|inglish)\b|अंग्रेजी|इंग्रजी/.test(value) ? 'en-IN'
      : /\b(tamil|tamizh)\b|तमिल|தமிழ்/.test(value) ? 'ta-IN' : null;
    if (!language) return say('Hindi, Marathi, English ya Tamil boliye, ya button dabaiye.');
    db.settings.lang = language;
    db.settings.languageChosen = true;
    $('lang').value = language;
    document.documentElement.lang = language.slice(0, 2);
    persist();
    S.mode = 'idle';
    render();
    say(tr('Bhasha chun li. Mic dabakar boliye.', 'भाषा निवडली. माइक दाबून बोला.', 'Language selected. Tap the microphone to speak.'));
  }

  function onIdle(text) {
    var r = Parser.parse(text, db.items);
    switch (r.intent) {
      case 'transaction':
        S.fails = 0;
        hideQuickPick();
        S.cards = r.cards;
        S.sharedTotal = r.sharedTotal;
        return proceed();
      case 'query_profit':
        S.fails = 0; S.tab = 'profit'; render();
        return say(profitReply());
      case 'report':
        S.fails = 0; S.tab = 'profit'; render();
        return say(reportReply());
      case 'query_sales':
        S.fails = 0; S.tab = 'sales'; render();
        return say(tr('Aaj ki bikri ', 'आजची विक्री ', 'Today’s sales: ') + rupees(Calc.totalSales(todayEntries())) + '.');
      case 'query_expense':
        S.fails = 0; S.tab = 'expenses'; render();
        return say(tr('Aaj ka kharcha ', 'आजचा खर्च ', 'Today’s expenses: ') + rupees(Calc.totalExpenses(todayEntries())) + '.');
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
    say(tr('Samajh nahi aaya. Aise boliye: "5 kilo chawal 300 rupaye mein beche".', 'समजले नाही. उदाहरण: "पाच किलो तांदूळ तीनशे रुपयांना विकला".', 'I did not understand. Try: "sold 5 kg rice for 300 rupees".'));
    if (S.fails >= 2) showQuickPick();
  }

  function onConfirm(text) {
    var r = Parser.parseConfirm(text, db.items);
    if (r.correction) { applyCorrection(r.correction); return proceed(); }
    if (r.answer === 'yes') return commit();
    if (r.answer === 'no') {
      S.mode = 'edit';
      render();
      return say(tr('Kya badalna hai?', 'काय बदलायचे आहे?', 'What would you like to change?'));
    }
    if (r.cancel) return cancelAll();
    say(tr('"Haan" ya "nahi" boliye. ', '"हो" किंवा "नाही" म्हणा. ', 'Say yes or no. ') + S.cards.map(cardSpeech).join('. ') + tr('. Sahi hai?', '. बरोबर आहे का?', '. Is that correct?'));
  }

  function onEdit(text) {
    var r = Parser.parseConfirm(text, db.items);
    if (r.correction) { applyCorrection(r.correction); return proceed(); }
    if (r.answer === 'yes') return proceed();
    if (r.answer === 'no' || r.cancel) return cancelAll(tr('Theek hai, entry cancel kar di.', 'ठीक आहे, नोंद रद्द केली.', 'Entry cancelled.'));
    say(tr('Jaise boliye: "400 rupaye" ya "6 kilo" ya cheez ka naam.', 'उदाहरण: "४०० रुपये", "६ किलो" किंवा वस्तूचे नाव म्हणा.', 'Say an amount, quantity, or item name.'));
  }

  function onAsk(text) {
    var c = S.cards[S.ask.index];
    var field = S.ask.field;
    var q = Parser.parseQuantity(text);
    if (!q) {
      // The user may have named the item or said "nahi"; treat it like a correction.
      var r = Parser.parseConfirm(text, db.items);
      if (r.correction && (r.correction.itemId || r.correction.candidates)) { applyCorrection(r.correction); return proceed(); }
      return say(field === 'qty'
        ? tr('Matra number mein boliye, jaise "paanch kilo".', 'संख्या सांगा, उदाहरण: पाच किलो.', 'Say a quantity, for example five kilograms.')
        : tr('Rakam boliye, jaise "teen sau rupaye".', 'रक्कम सांगा, उदाहरण: तीनशे रुपये.', 'Say an amount, for example three hundred rupees.'));
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
      var names = S.choose.ids.slice(0, 3).map(function (x) { var it = itemById(x); return it ? itemSay(it) : x; });
      return say(tr('Button dabaiye ya naam boliye: ', 'बटण दाबा किंवा नाव सांगा: ', 'Tap a button or say a name: ') + names.join(tr(' ya ', ' की ', ' or ')) + '?');
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
    if (!last) return say(tr('Hatane ke liye koi entry nahi hai.', 'काढण्यासाठी नोंद नाही.', 'There is no entry to remove.'));
    S.mode = 'undo';
    S.undoId = last.id;
    render();
    say(tr('Pichhli entry: ', 'मागील नोंद: ', 'Last entry: ') + entrySpeech(last) + tr('. Ise hatana hai?', '. ती काढायची का?', '. Remove it?'));
  }

  function onUndoAnswer(text) {
    var a = Parser.yesNo(text);
    if (a === 'yes') {
      db.entries = db.entries.filter(function (e) { return e.id !== S.undoId; });
      persist();
      S.mode = 'idle';
      render();
      return say(tr('Pichhli entry hata di.', 'मागील नोंद काढली.', 'The last entry was removed.'));
    }
    if (a === 'no') { S.mode = 'idle'; render(); return say(tr('Theek hai, entry nahi hatayi.', 'ठीक आहे, नोंद काढली नाही.', 'The entry was not removed.')); }
    say(tr('"Haan" ya "nahi" boliye. Pichhli entry hatani hai?', 'हो किंवा नाही म्हणा. मागील नोंद काढायची का?', 'Say yes or no. Remove the last entry?'));
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
    say(tr('Aaj ka hisaab sunna chahenge?', 'आजचा हिशोब ऐकायचा का?', 'Would you like to hear today’s summary?'));
  }

  function onReportAnswer(text) {
    var a = Parser.yesNo(text);
    if (a === 'yes') { S.mode = 'idle'; S.tab = 'profit'; render(); return say(reportReply()); }
    if (a === 'no') { S.mode = 'idle'; render(); return say(tr('Theek hai. Shubh ratri!', 'ठीक आहे. शुभ रात्री!', 'All right. Good night!')); }
    say(tr('"Haan" ya "nahi" boliye. Aaj ka hisaab sunna chahenge?', 'हो किंवा नाही म्हणा. आजचा हिशोब ऐकायचा का?', 'Say yes or no. Would you like today’s summary?'));
  }

  // ---------- voice setup: describe shop + up to 3 follow-ups, fills a fixed template ----------
  function startSetup() {
    S.cards = [];
    S.mode = 'setup';
    S.setup = { step: 0 };
    render();
    say(tr('Apni dukaan ke baare mein bataiye. Aap kya bechte hain?', 'तुमच्या दुकानाबद्दल सांगा. तुम्ही काय विकता?', 'Tell me about your shop. What do you sell?'));
  }

  function setupStep(text) {
    var st = S.setup;
    if (Parser.isCancel(text) && !Parser.isSkip(text)) return cancelAll(tr('Setup band kiya. Purana data waisa hi hai.', 'सेटअप रद्द केला. जुनी माहिती तशीच आहे.', 'Setup cancelled. Your existing data is unchanged.'));
    if (st.step === 0) {
      var tpl = Data.TEMPLATES[Parser.matchTemplate(text, Data.TEMPLATES)];
      st.tpl = tpl.id;
      st.items = Data.clone(tpl.items);
      st.step = 1;
      render();
      return say(tpl.label + tr(' ka template mila. Mukhya cheezein kaun si hain? Sab chahiye to "sab" boliye.', ' साचा निवडला. मुख्य वस्तू कोणत्या? सर्व हव्या असतील तर "सर्व" म्हणा.', ' template selected. Which items do you sell? Say "all" for all items.'));
    }
    if (st.step === 1) {
      var ids = Parser.mentionedItems(text, st.items);
      if (!ids.length && !Parser.isSkip(text)) return say(tr('Template ki cheezein boliye, ya sab ke liye "sab" boliye.', 'साच्यातील वस्तू सांगा किंवा "सर्व" म्हणा.', 'Name items in the template, or say "all".'));
      if (ids.length && !Parser.isSkip(text)) st.items = st.items.filter(function (it) { return ids.indexOf(it.id) >= 0; });
      st.step = 2;
      st.completed = {};
      render();
      return say(tr('Har cheez ki unit bataiye, jaise "chawal kilo, biscuit packet". Template units rakhne ke liye "skip" boliye.', 'प्रत्येक वस्तूचे एकक सांगा, जसे "तांदूळ किलो, बिस्किट पाकीट". साच्यातील एकके ठेवण्यासाठी "skip" म्हणा.', 'Say each item and unit, for example "rice kilogram, biscuit packet". Say "skip" to keep template units.'));
    }
    if (st.step === 2) {
      var units = Parser.parseSetupValues(text, st.items, 'unit');
      Object.keys(units).forEach(function (id) {
        var item = st.items.filter(function (x) { return x.id === id; })[0];
        item.unit = units[id]; st.completed[id] = true;
      });
      if (!Parser.isSkip(text) && st.items.some(function (item) { return !st.completed[item.id]; })) {
        return say(tr('Inki unit bhi bataiye: ', 'यांची एककेही सांगा: ', 'Please give units for: ') + st.items.filter(function (item) { return !st.completed[item.id]; })
          .map(itemSay).join(', ') + tr('. Ya template rakhne ke liye "skip" boliye.', '. किंवा साचा ठेवण्यासाठी "skip" म्हणा.', '. Or say "skip" to keep template units.'));
      }
      st.step = 3;
      st.completed = {};
      render();
      return say(tr('Har cheez ka khareed daam boliye, jaise "chawal 40, biscuit 8". Template daam rakhne ke liye "skip" boliye.', 'प्रत्येक वस्तूची खरेदी किंमत सांगा, जसे "तांदूळ चाळीस, बिस्किट आठ". साच्यातील किंमतींसाठी "skip" म्हणा.', 'Say each buying price, for example "rice 40 and biscuit 8". Say "skip" to keep template prices.'));
    }
    if (st.step === 3) {
      var prices = Parser.parseSetupValues(text, st.items, 'price');
      Object.keys(prices).forEach(function (id) {
        var item = st.items.filter(function (x) { return x.id === id; })[0];
        item.buy = prices[id];
        st.completed[id] = true;
      });
      if (!Parser.isSkip(text) && st.items.some(function (item) { return !st.completed[item.id]; })) {
        return say(tr('Inka khareed daam bhi bataiye: ', 'यांची खरेदी किंमतही सांगा: ', 'Please give buying prices for: ') + st.items.filter(function (item) { return !st.completed[item.id]; })
          .map(itemSay).join(', ') + tr('. Ya template rakhne ke liye "skip" boliye.', '. किंवा साचा ठेवण्यासाठी "skip" म्हणा.', '. Or say "skip" to keep template prices.'));
      }
      st.step = 4;
      render();
      return say(tr('Naya setup purani entries badal dega, sync wale devices par bhi. Stock shuru mein zero hoga. Aage badhein?',
        'नवीन सेटअपने जुन्या नोंदी बदलतील, सिंक केलेल्या उपकरणांवरही. सुरुवातीचा साठा शून्य असेल. पुढे जायचे का?',
        'This setup replaces the existing entries, including on synced devices. Starting stock will be zero. Continue?'));
    }
    if (st.step === 4) {
      var answer = Parser.yesNo(text);
      if (answer === 'no') return cancelAll(tr('Setup band kiya. Purana data waisa hi hai.', 'सेटअप रद्द केला. जुनी माहिती तशीच आहे.', 'Setup cancelled. Existing data is unchanged.'));
      if (answer !== 'yes') return say(tr('Haan ya nahi boliye. Purani entries badalni hain?', 'हो किंवा नाही म्हणा. जुन्या नोंदी बदलायच्या का?', 'Say yes or no. Replace the existing entries?'));
      var lang = db.settings.lang;
      db = Data.freshDb(st.tpl, Date.now(), false);
      st.items.forEach(function (item) { item.opening = 0; });
      db.items = st.items;
      db.settings.lang = lang;
      db.settings.languageChosen = true;
      db.settings.setupDone = true;
      persist();
      S.mode = 'idle';
      S.setup = null;
      S.tab = 'stock';
      render();
      say(tr('Dukaan taiyaar! ', 'दुकान तयार आहे! ', 'Your shop is ready! ') + st.items.length +
        tr(' cheezein: ', ' वस्तू: ', ' items: ') + st.items.map(itemSay).join(', ') +
        tr('. Stock zero se shuru hai; maujooda maal ki purchase entry daaliye.', '. साठा शून्यापासून सुरू आहे; असलेल्या मालाची खरेदी नोंद करा.', '. Stock starts at zero; record your existing stock as purchases.'));
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
    say(tr('Boliye, main sun raha hoon.', 'बोला, मी ऐकत आहे.', 'Please speak; I am listening.'));
  }

  function setListeningUi(on) {
    listening = on;
    $('mic').classList.toggle('listening', on);
    $('mic').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('micLabel').textContent = !SR
      ? tr('Bolkar entry nahi chalti. Neeche likhiye.', 'आवाज उपलब्ध नाही. खाली लिहा.', 'Voice input is unavailable. Type below.')
      : on
      ? tr('Sun raha hoon… (rokne ke liye dabaiye)', 'ऐकत आहे… (थांबवण्यासाठी दाबा)', 'Listening… (tap to stop)')
      : tr('Dabaiye aur boliye', 'दाबा आणि बोला', 'Tap and speak');
  }

  function recognitionFailed() {
    S.fails++;
    say(tr('Awaaz saaf nahi aayi, phir se boliye.', 'आवाज स्पष्ट आला नाही, पुन्हा बोला.', 'I could not hear clearly. Please try again.'));
    $('noiseHint').classList.add('strong');
    if (S.fails >= 2) showQuickPick();
  }

  function startListening() {
    if (!SR) {
      say(tr('Is browser mein bolkar entry nahi chalti. Neeche likhiye.', 'या ब्राउझरमध्ये आवाजाने नोंद होत नाही. खाली लिहा.', 'Voice input is not available in this browser. Please type below.'));
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
      if (err === 'no-speech') { if (!gotFinal) say(tr('Boliye, main sun raha hoon.', 'बोला, मी ऐकत आहे.', 'Please speak; I am listening.')); }
      else if (err === 'aborted') { /* stopped by us */ }
      else if (err === 'not-allowed' || err === 'service-not-allowed') {
        say(tr('Mic ki permission nahi mili. Neeche likhkar entry kijiye.', 'मायक्रोफोनची परवानगी मिळाली नाही. खाली लिहा.', 'Microphone permission was denied. Please type below.'));
        showFallback();
      } else if (err === 'network') {
        say(tr('Awaaz pehchanne ke liye internet chahiye. Abhi neeche likhkar entry kijiye.', 'आवाज ओळखण्यासाठी इंटरनेट आवश्यक आहे. खाली लिहा.', 'Speech recognition needs internet. Please type below.'));
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
    if (mode === 'language') {
      box.appendChild(el('p', 'card-msg', 'Aap kaunsi bhasha mein baat karenge? / Choose your language'));
      var languages = el('div', 'actions');
      [['हिंदी', 'hindi'], ['मराठी', 'marathi'], ['English', 'english'], ['தமிழ்', 'tamil']].forEach(function (pair) {
        languages.appendChild(button('ghost', pair[0], function () { handle(pair[1]); }));
      });
      box.appendChild(languages);
      return;
    }
    if (mode === 'undo') {
      var last = lastEntry();
      box.appendChild(el('p', 'card-msg', tr('Pichhli entry hatani hai?', 'मागील नोंद काढायची का?', 'Remove the last entry?')));
      if (last) box.appendChild(entryCard(last));
      box.appendChild(yesNoActions(tr('Haan, hatao', 'हो, काढा', 'Yes, remove'), tr('Nahi', 'नाही', 'No')));
      return;
    }
    if (mode === 'report') {
      box.appendChild(el('p', 'card-msg', tr('🌙 Aaj ka hisaab sunna chahenge?', '🌙 आजचा हिशोब ऐकायचा का?', '🌙 Hear today’s summary?')));
      box.appendChild(yesNoActions(tr('Haan, sunao', 'हो, सांगा', 'Yes'), tr('Nahi', 'नाही', 'No')));
      return;
    }
    if (mode === 'setup') {
      var steps = [
        tr('Dukaan ke baare mein bataiye', 'दुकानाबद्दल सांगा', 'Describe your shop'),
        tr('Mukhya cheezein (ya "sab")', 'मुख्य वस्तू (किंवा "सर्व")', 'Items (or "all")'),
        tr('Har cheez ki unit', 'प्रत्येक वस्तूचे एकक', 'Each item’s unit'),
        tr('Har cheez ka khareed daam', 'प्रत्येक वस्तूची खरेदी किंमत', 'Each item’s buying price'),
        tr('Naya setup purani entries badal dega aur stock zero hoga. Confirm karein?', 'नवीन सेटअप जुन्या नोंदी बदलेल आणि साठा शून्य होईल. खात्री आहे का?', 'New setup replaces existing entries and starts stock at zero. Continue?')
      ];
      box.appendChild(el('p', 'card-msg', '🏪 ' + (S.setup.step < 4 ? 'Setup ' + (S.setup.step + 1) + '/4: ' : '') + steps[S.setup.step]));
      if (S.setup.step === 4) {
        box.appendChild(yesNoActions(tr('Haan, badlo', 'हो, बदला', 'Yes, replace'), tr('Nahi', 'नाही', 'No')));
        return;
      }
      var acts = el('div', 'actions');
      if (S.setup.step === 0) {
        Object.keys(Data.TEMPLATES).forEach(function (id) {
          acts.appendChild(button('ghost', Data.TEMPLATES[id].label, function () { handle(Data.TEMPLATES[id].keywords[0]); }));
        });
      } else if (S.setup.step === 1) {
        acts.appendChild(button('ghost', 'Sab', function () { handle('sab'); }));
      } else if (S.setup.step === 2 && S.setup.items.length === 1) {
        ['kilo', 'litre', 'packet', 'piece'].forEach(function (u) { acts.appendChild(button('ghost', u, function () { handle(u); })); });
      }
      if (S.setup.step === 2 || S.setup.step === 3) {
        acts.appendChild(button('ghost', 'Template rakho / Skip', function () { handle('skip'); }));
      }
      acts.appendChild(button('no', 'Setup band', function () { cancelAll('Setup band kiya. Purana data waisa hi hai.'); }));
      box.appendChild(acts);
      return;
    }
    if (!S.cards.length) return;

    var title = { confirm: tr('Sahi hai?', 'बरोबर आहे का?', 'Is this correct?'), edit: tr('Kya badalna hai?', 'काय बदलायचे?', 'What should change?'),
      ask: tr('Jaankari chahiye', 'माहिती हवी आहे', 'More information needed'), choose: tr('Kaun si cheez?', 'कोणती वस्तू?', 'Which item?') }[mode] || '';
    box.appendChild(el('p', 'card-msg', title));
    S.cards.forEach(function (c, i) { box.appendChild(draftCard(c, i)); });

    var actions = el('div', 'actions');
    if (mode === 'confirm') {
      actions.appendChild(button('yes', tr('✔ Haan, sahi hai', '✔ हो, बरोबर', '✔ Yes, correct'), function () { handle('haan'); }));
      actions.appendChild(button('no', tr('✘ Nahi', '✘ नाही', '✘ No'), function () { handle('nahi'); }));
    } else if (mode === 'edit') {
      var target = S.cards.length - 1;
      var tc = S.cards[target];
      actions.appendChild(button('', tr('Rakam badlo', 'रक्कम बदला', 'Change amount'), function () { askField(target, 'amount', tr('Sahi rakam boliye.', 'योग्य रक्कम सांगा.', 'Say the correct amount.')); }));
      if (tc.type !== 'expense') actions.appendChild(button('', tr('Matra badlo', 'संख्या बदला', 'Change quantity'), function () { askField(target, 'qty', tr('Sahi matra boliye.', 'योग्य संख्या सांगा.', 'Say the correct quantity.')); }));
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
    row.appendChild(el('span', 'type ' + c.type, typeLabel(c.type)));
    var mid = el('div');
    var it = itemById(c.itemId);
    var whatText = c.type === 'expense' ? catLabel(c.category)
      : it ? tr(it.name, itemSay(it), itemSay(it))
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
    row.appendChild(el('span', 'type ' + e.type, typeLabel(e.type)));
    var it = itemById(e.itemId);
    var mid = el('div');
    mid.appendChild(el('div', 'what', e.type === 'expense' ? catSay(e.category) : (it ? itemSay(it) : e.itemId)));
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
    var what = e.type === 'expense' ? catSay(e.category)
      : (it ? tr(it.name, itemSay(it), itemSay(it)) : e.itemId) + ' · ' + num(e.qty) + ' ' + unitSay(it);
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
      p.appendChild(totalBox(tr('Aaj ki bikri', 'आजची विक्री', 'Today’s sales') + ' (' + sales.length + ')', Calc.formatINR(Calc.totalSales(tE))));
      p.appendChild(listOf(sales, tr('Aaj abhi tak koi bikri nahi.', 'आज विक्री नाही.', 'No sales today.')));
    } else if (S.tab === 'expenses') {
      var ex = tE.filter(function (e) { return e.type === 'expense'; });
      p.appendChild(totalBox(tr('Aaj ka kharcha', 'आजचा खर्च', 'Today’s expenses'), Calc.formatINR(Calc.totalExpenses(tE))));
      p.appendChild(listOf(ex, tr('Aaj koi kharcha nahi.', 'आज खर्च नाही.', 'No expenses today.')));
    } else if (S.tab === 'stock') {
      var lv = stock();
      var ul = el('ul', 'list');
      db.items.forEach(function (it) {
        var li = el('li');
        var low = Calc.isLowStock(it, lv[it.id]);
        if (low) li.className = 'low';
        li.appendChild(el('span', 'time', '₹' + Calc.formatNumber(it.buy) + '→' + Calc.formatNumber(it.sell)));
        var name = el('span', '', tr(it.name, itemSay(it), itemSay(it)));
        if (low) name.appendChild(el('span', 'tag', tr('KAM', 'कमी', 'LOW')));
        li.appendChild(name);
        li.appendChild(el('span', 'amt', it.service ? tr('seva', 'सेवा', 'service') : num(lv[it.id]) + ' ' + unitSay(it)));
        ul.appendChild(li);
      });
      p.appendChild(ul);
      var pur = tE.filter(function (e) { return e.type === 'purchase'; });
      p.appendChild(el('h3', '', tr('Aaj aaya maal: ', 'आजचा खरेदी माल: ', 'Today’s purchases: ') + Calc.formatINR(Calc.totalPurchases(tE))));
      p.appendChild(listOf(pur, tr('Aaj koi maal nahi aaya.', 'आज माल खरेदी नाही.', 'No purchases today.')));
    } else {
      var s = Calc.profitSummary(tE, db.items);
      var big = el('div', 'profit-big' + (s.profit < 0 ? ' loss' : ''));
      big.appendChild(el('div', '', s.profit < 0 ? tr('Aaj ka nuksaan', 'आजचा तोटा', 'Today’s loss') : tr('Aaj ka munafa', 'आजचा नफा', 'Today’s profit')));
      big.appendChild(el('div', 'val', Calc.formatINR(s.profit)));
      p.appendChild(big);
      var t = el('table', 'breakdown');
      [[tr('Bikri (Sales)', 'विक्री', 'Sales'), '+ ' + Calc.formatINR(s.sales)],
        [tr('Bechi cheezon ki khareed (Cost)', 'विकलेल्या मालाची खरेदी किंमत', 'Cost of goods sold'), '− ' + Calc.formatINR(s.cost)],
        [tr('Kharcha (Expenses)', 'खर्च', 'Expenses'), '− ' + Calc.formatINR(s.expenses)],
        [tr('Munafa (Profit)', 'नफा', 'Profit'), Calc.formatINR(s.profit)]].forEach(function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', '', r[0]));
        tr.appendChild(el('td', '', r[1]));
        t.appendChild(tr);
      });
      p.appendChild(t);
      p.appendChild(el('p', 'formula', tr('Munafa = Bikri − bechi cheezon ki khareed keemat − kharcha. Maal kharidna (stock) munafa tab ghatata hai jab woh bikta hai.', 'नफा = विक्री − विकलेल्या मालाची खरेदी किंमत − खर्च. माल विकल्यावर त्याची खरेदी किंमत वजा होते.', 'Profit = sales − cost of goods sold − expenses. Stock purchases affect profit when the items are sold.')));
      p.appendChild(el('h3', '', tr('Pichhle 7 din', 'मागील ७ दिवस', 'Last 7 days')));
      var ul7 = el('ul', 'list');
      Calc.dailyHistory(db.entries, db.items, Date.now(), 7).forEach(function (d) {
        var li = el('li');
        li.appendChild(el('span', 'time', d.key.slice(5)));
        li.appendChild(el('span', '', tr('Bikri ', 'विक्री ', 'Sales ') + Calc.formatINR(d.sales)));
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

  function typeLabel(type) {
    if (type === 'sale') return tr('Bikri', 'विक्री', 'Sale');
    if (type === 'purchase') return tr('Maal aaya', 'खरेदी', 'Purchase');
    return tr('Kharcha', 'खर्च', 'Expense');
  }

  function renderLanguage() {
    $('transcriptLabel').textContent = tr('Aapne kaha', 'तुम्ही म्हणालात', 'You said');
    $('quickTitle').textContent = tr('Tap karke chuniye', 'दाबून निवडा', 'Tap to select');
    $('sendBtn').textContent = tr('Bhejo', 'पाठवा', 'Send');
    $('typeInput').placeholder = tr('Ya yahan likhiye…', 'किंवा येथे लिहा…', 'Or type here…');
    $('quickNumber').placeholder = tr('Matra ya rakam', 'संख्या किंवा रक्कम', 'Quantity or amount');
    $('quickNumber').setAttribute('aria-label', $('quickNumber').placeholder);
    $('typeInput').setAttribute('aria-label', tr('Likhkar entry', 'लिहून नोंद करा', 'Type an entry'));
    $('mic').setAttribute('aria-label', tr('Bolne ke liye dabaiye', 'बोलण्यासाठी दाबा', 'Tap to speak'));
    $('replay').setAttribute('aria-label', tr('Phir se suniye', 'पुन्हा ऐका', 'Listen again'));
    $('noiseHint').textContent = tr('🔊 Shor hai? Phone munh ke paas rakhein · Noisy place? Move closer', '🔊 आवाज आहे? फोन तोंडाजवळ ठेवा.', '🔊 Noisy place? Move the phone closer.');
    $('settingsTitle').textContent = tr('Dukaan settings', 'दुकान सेटिंग्ज', 'Shop settings');
    $('setupBtn').textContent = tr('🏪 Dukaan setup (bolkar)', '🏪 दुकान सेटअप', '🏪 Set up shop');
    $('resetBtn').textContent = tr('Sample data wapas', 'नमुना डेटा परत आणा', 'Reset sample data');
    $('syncTitle').textContent = tr('Account aur sync', 'खाते आणि सिंक', 'Account and sync');
    $('syncUserLabel').textContent = tr('Username', 'वापरकर्ता नाव', 'Username');
    $('syncPasswordLabel').textContent = tr('Password (kam se kam 10 akshar)', 'पासवर्ड (किमान १० अक्षरे)', 'Password (at least 10 characters)');
    $('syncLogin').textContent = tr('Sign in', 'साइन इन', 'Sign in');
    $('syncRegister').textContent = tr('Account banayein', 'खाते तयार करा', 'Create account');
    $('syncLogout').textContent = tr('Sign out', 'साइन आउट', 'Sign out');
    $('syncConflictPrompt').textContent = tr('Phone aur account ka data alag hai. Ek poora version chuniye. Doosra badal diya jayega.',
      'फोन आणि खात्यावरील माहिती वेगळी आहे. एक संपूर्ण आवृत्ती निवडा. दुसरी बदलली जाईल.',
      'Data differs between this device and the account. Choose which complete version to keep. The other version will be replaced.');
    $('syncKeepLocal').textContent = tr('Phone ka rakhein', 'फोनवरील ठेवा', 'Keep this device');
    $('syncKeepRemote').textContent = tr('Account ka rakhein', 'खात्यावरील ठेवा', 'Keep account version');
    var shortcuts = document.querySelectorAll('.shortcuts button');
    shortcuts[0].textContent = tr('💰 Aaj ka munafa?', '💰 आजचा नफा?', '💰 Today’s profit?');
    shortcuts[1].textContent = tr('↩ Pichhla hatao', '↩ मागील नोंद काढा', '↩ Undo last entry');
    shortcuts[2].textContent = tr('📒 Aaj ka hisaab', '📒 आजचा हिशोब', '📒 Today’s summary');
    var types = document.querySelectorAll('#quickTypes button');
    types[0].textContent = typeLabel('sale');
    types[1].textContent = typeLabel('purchase');
    types[2].textContent = typeLabel('expense');
    var tabLabels = [
      [tr('Bikri', 'विक्री', 'Sales'), tr('Sales', 'Sales', 'बिक्री')],
      [tr('Kharcha', 'खर्च', 'Expenses'), tr('Expenses', 'Expenses', 'खर्च')],
      [tr('Stock', 'साठा', 'Stock'), tr('Maal', 'Stock', 'साठा')],
      [tr('Munafa', 'नफा', 'Profit'), tr('Profit', 'Profit', 'नफा')]
    ];
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab, index) {
      tab.firstChild.nodeValue = tabLabels[index][0];
      tab.querySelector('small').textContent = tabLabels[index][1];
    });
    setListeningUi(listening);
  }

  function renderSettings() {
    var tpl = Data.TEMPLATES[db.settings.template] || Data.TEMPLATES.kirana;
    $('shopName').textContent = tr('Template: ', 'साचा: ', 'Template: ') + tpl.label + ' · ' + db.items.length +
      tr(' cheezein · ', ' वस्तू · ', ' items · ') + db.entries.length + tr(' entries', ' नोंदी', ' entries');
    var key = (CFG.AI_API_KEY || '').trim();
    $('aiStatus').textContent = key
      ? tr('Optional AI key set hai. Hisaab phir bhi sirf calc.js ke fixed rules se hota hai.', 'ऐच्छिक AI key सेट आहे. हिशोब निश्चित नियमांनीच होतो.', 'Optional AI key is set. Calculations still use fixed rules.')
      : tr('Optional AI helper: key not set. App poori tarah built-in rules se chalta hai (koi key zaroori nahi).', 'ऐच्छिक AI key सेट नाही. अॅप निश्चित नियम वापरते; key आवश्यक नाही.', 'Optional AI helper: key not set. The app uses built-in rules; no key is required.');
  }

  function render() {
    renderLanguage();
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
      db.settings.languageChosen = true;
      if (S.mode === 'language') S.mode = 'idle';
      persist();
      document.documentElement.lang = this.value.slice(0, 2);
      render();
      say(tr('Bhasha badal di.', 'भाषा बदलली आहे.', 'Language changed.'));
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
    $('quickNumberForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var value = $('quickNumber').value;
      $('quickNumber').value = '';
      handle(value);
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
      if (!window.confirm(tr('Saari entries hata kar sample data wapas laayein? Sync wale devices par bhi data badlega.',
        'सर्व नोंदी काढून नमुना डेटा आणायचा का? सिंक केलेल्या उपकरणांवरील डेटा देखील बदलेल.',
        'Replace all entries with sample data? Synced devices will also be changed.'))) return;
      var lang = db.settings.lang;
      db = Data.freshDb('kirana', Date.now(), true);
      db.settings.lang = lang;
      db.settings.languageChosen = true;
      persist();
      cancelAll('Sample data wapas aa gaya.');
    });
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    updateOnline();
    if (!SR) $('micLabel').textContent = 'Bolkar entry is browser mein nahi chalti - neeche likhiye';

    persist(false);
    render();
    if (S.mode === 'language') say('Aap kaunsi bhasha mein baat karenge? Hindi, Marathi, English ya Tamil?');
    else setReply(tr('Namaste! Mic dabakar boliye.', 'नमस्कार! माइक दाबून बोला.', 'Hello! Tap the microphone to speak.'));

    ShopSync.init({
      get: function () { return db; },
      canReplace: function () { return S.mode === 'idle' && !listening; },
      replace: function (snapshot) {
        if (!snapshot || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.entries) || !snapshot.settings) {
          throw new Error('Invalid account data. Local data was not changed.');
        }
        localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
        db = snapshot;
        $('lang').value = db.settings.lang || 'hi-IN';
        document.documentElement.lang = $('lang').value.slice(0, 2);
        render();
      }
    });

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
