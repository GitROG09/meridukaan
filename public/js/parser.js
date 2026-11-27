/*
 * MeriDukaan - parser.js
 * Rule-based understanding of shopkeeper speech: keywords, number words, units and
 * fuzzy item matching. Hinglish, Hindi/Marathi (Devanagari), Tamil and English.
 * No network, no AI, no arithmetic on money beyond reading the numbers spoken.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Parser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- text normalisation ----------
  function normalize(text) {
    var s = String(text == null ? '' : text).normalize('NFC').toLowerCase();
    s = s.replace(/[\u0966-\u096F]/g, function (d) { return String(d.charCodeAt(0) - 0x966); }); // Devanagari digits
    s = s.replace(/[\u0BE6-\u0BEF]/g, function (d) { return String(d.charCodeAt(0) - 0xBE6); }); // Tamil digits
    s = s.replace(/(\d),(?=\d)/g, '$1');            // 3,00,000 -> 300000
    s = s.replace(/₹/g, ' ₹ ');
    s = s.replace(/(\d)([^\d\s.,])/g, '$1 $2').replace(/([^\d\s.,₹])(\d)/g, '$1 $2'); // 5kg -> 5 kg
    s = s.replace(/,/g, ' , ');
    s = s.replace(/(^|[^\d])\.|\.(?!\d)/g, '$1 ');   // keep decimal points only
    s = s.replace(/[!?;:"'`()[\]{}\u0964\u0965|/\\\-–—*]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function tokenize(text) {
    var n = normalize(text);
    return n ? n.split(' ') : [];
  }

  function set(list) {
    var s = new Set();
    list.forEach(function (w) { s.add(normalize(w)); });
    return s;
  }

  function map(obj) {
    var m = new Map();
    Object.keys(obj).forEach(function (k) { m.set(normalize(k), obj[k]); });
    return m;
  }

  // ---------- number words ----------
  var NUM = map({
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90, half: 0.5,
    // Hindi (roman)
    ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, paach: 5, chhe: 6, chhah: 6, chah: 6, chheh: 6,
    saat: 7, aath: 8, nau: 9, das: 10, dus: 10, gyarah: 11, gyara: 11, barah: 12, baarah: 12, terah: 13,
    chaudah: 14, chauda: 14, pandrah: 15, pandra: 15, solah: 16, sola: 16, satrah: 17, satra: 17,
    atharah: 18, athara: 18, unnis: 19, unees: 19, bees: 20, bis: 20, pachees: 25, pachis: 25, tees: 30,
    chalis: 40, chaalis: 40, chalees: 40, pachas: 50, pachaas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
    dedh: 1.5, dhai: 2.5, dhaai: 2.5, aadha: 0.5, adha: 0.5, aadhi: 0.5,
    // Marathi (roman)
    don: 2, pach: 5, saha: 6, daha: 10, vees: 20, pannas: 50, teenshe: 300, donshe: 200, charshe: 400, chaarshe: 400, pachshe: 500,
    // Tamil (roman)
    onnu: 1, ondru: 1, onru: 1, rendu: 2, irandu: 2, moonu: 3, munu: 3, naalu: 4, nalu: 4, anju: 5,
    aindhu: 5, aaru: 6, ezhu: 7, ettu: 8, onbadhu: 9, onbathu: 9, pathu: 10, irupathu: 20, muppathu: 30,
    aimbathu: 50, irunooru: 200, munnooru: 300, naanooru: 400, ainooru: 500,
    // Hindi (Devanagari)
    'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6, 'छे': 6, 'सात': 7, 'आठ': 8,
    'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'पन्द्रह': 15,
    'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20, 'पच्चीस': 25, 'तीस': 30, 'चालीस': 40,
    'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90, 'डेढ़': 1.5, 'डेढ': 1.5, 'ढाई': 2.5,
    'आधा': 0.5, 'आधी': 0.5,
    // Marathi (Devanagari)
    'दोन': 2, 'पाच': 5, 'सहा': 6, 'दहा': 10, 'वीस': 20, 'पन्नास': 50, 'दोनशे': 200, 'तीनशे': 300,
    'चारशे': 400, 'पाचशे': 500,
    // Tamil script
    'ஒன்று': 1, 'இரண்டு': 2, 'மூன்று': 3, 'நான்கு': 4, 'ஐந்து': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8,
    'ஒன்பது': 9, 'பத்து': 10, 'இருபது': 20, 'ஐம்பது': 50, 'இருநூறு': 200, 'முன்னூறு': 300
  });
  var HUNDRED = set(['hundred', 'sau', 'shambhar', 'nooru', 'सौ', 'शंभर', 'நூறு']);
  var BIG = map({
    thousand: 1000, hazaar: 1000, hazar: 1000, hajar: 1000, hajaar: 1000, aayiram: 1000, ayiram: 1000,
    'हज़ार': 1000, 'हजार': 1000, 'ஆயிரம்': 1000, lakh: 100000, lac: 100000, lakhs: 100000, 'लाख': 100000
  });

  // "saade teen sau" = 350, "sawa do" = 2.25, "paune do" = 1.75: the fraction applies to the next number.
  var FRACTION = map({
    saade: 0.5, sade: 0.5, saadhe: 0.5, sadhe: 0.5, 'साढ़े': 0.5, 'साढे': 0.5, 'साडे': 0.5,
    sawa: 0.25, sava: 0.25, savva: 0.25, 'सवा': 0.25,
    paune: -0.25, pone: -0.25, paavne: -0.25, 'पौने': -0.25, 'पावणे': -0.25
  });

  function isDigits(t) { return /^\d+(\.\d+)?$/.test(t); }

  // "hata do", "kar do", "rehne do": here "do" means "give/do", not the number 2.
  var DO_WORDS = new Set(['do', normalize('दो')]);
  var DO_VERBS = new Set(['kar', 'karo', 'hata', 'rehne', 'rahne', 'de', 'bata', 'likh', 'save', 'chhod', 'jod',
    'mita', 'cancel', 'bhej', 'sun', 'suna', 'dikha', 'kat', 'band'].concat(['कर', 'हटा', 'रहने', 'दे', 'बता', 'लिख'].map(normalize)));

  // Turns a token list into tokens where runs of number words/digits become {n}.
  function groupNumbers(tokens) {
    var out = [];
    var total = 0, cur = 0, has = false, raw = [], prevDigit = false, frac = null, fracTok = null;
    function flush() {
      if (has) out.push({ kind: 'num', n: Math.round((total + cur) * 100) / 100, t: raw.join(' ') });
      total = 0; cur = 0; has = false; raw = []; prevDigit = false;
    }
    function dropFraction() {
      if (frac != null) out.push({ t: fracTok });
      frac = null; fracTok = null;
    }
    tokens.forEach(function (t, i) {
      var digit = isDigits(t);
      var kind = null, v = null;
      var verbDo = DO_WORDS.has(t) && i > 0 && DO_VERBS.has(tokens[i - 1]) &&
        (i === tokens.length - 1 || !NUM.has(tokens[i + 1]) && !HUNDRED.has(tokens[i + 1]) && !UNITS.has(tokens[i + 1]));
      if (verbDo) { flush(); dropFraction(); out.push({ t: t }); return; }
      if (FRACTION.has(t)) { flush(); dropFraction(); frac = FRACTION.get(t); fracTok = t; return; }
      if (digit) { kind = 'v'; v = parseFloat(t); }
      else if (NUM.has(t)) { kind = 'v'; v = NUM.get(t); }
      else if (HUNDRED.has(t)) kind = 'h';
      else if (BIG.has(t)) { kind = 'b'; v = BIG.get(t); }
      if (!kind) { flush(); dropFraction(); out.push({ t: t }); return; }

      if (frac != null) {
        // Start a fresh number: "sawa sau" = 1.25 x 100, "saade teen" = 3.5.
        flush();
        if (kind === 'v') { cur = v + frac; raw = [fracTok, t]; has = true; prevDigit = digit; frac = null; return; }
        cur = 1 + frac; raw = [fracTok]; has = true; frac = null;
      }

      if (kind === 'h') {
        if (cur >= 100) flush();
        cur = (cur || 1) * 100;
      } else if (kind === 'b') {
        total += (cur || 1) * v;
        cur = 0;
      } else if (!has) {
        cur = v;
      } else {
        var afterBig = cur === 0 && total > 0 && v < 1000;
        var wordsOnly = !digit && !prevDigit;
        var hundredsPlus = wordsOnly && cur >= 100 && cur % 100 === 0 && v < 100;
        var tensPlus = wordsOnly && cur >= 20 && cur < 100 && cur % 10 === 0 && v < 10;
        if (afterBig || hundredsPlus || tensPlus) cur += v;
        else { flush(); cur = v; }
      }
      has = true;
      raw.push(t);
      prevDigit = digit;
    });
    flush();
    dropFraction();
    return out;
  }

  // First number found in a phrase, or null.
  function parseNumber(text) {
    var g = groupNumbers(tokenize(text));
    for (var i = 0; i < g.length; i++) if (g[i].kind === 'num') return g[i].n;
    return null;
  }

  // ---------- vocabulary ----------
  var UNITS = map({
    kilo: 'kg', kilos: 'kg', kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg', 'किलो': 'kg', 'கிலோ': 'kg',
    gram: 'g', grams: 'g', gm: 'g', gms: 'g', gramm: 'g', 'ग्राम': 'g', 'கிராம்': 'g',
    litre: 'litre', liter: 'litre', litres: 'litre', liters: 'litre', ltr: 'litre', 'लीटर': 'litre',
    'लिटर': 'litre', 'லிட்டர்': 'litre',
    ml: 'ml',
    packet: 'packet', packets: 'packet', pkt: 'packet', pack: 'packet', paket: 'packet', pakit: 'packet',
    'पैकेट': 'packet', 'पाकीट': 'packet', 'பாக்கெட்': 'packet',
    piece: 'piece', pieces: 'piece', pcs: 'piece', pc: 'piece', nag: 'piece', plate: 'piece', cup: 'piece',
    'नग': 'piece', 'पीस': 'piece', 'प्लेट': 'piece',
    dozen: 'dozen', darjan: 'dozen', 'दर्जन': 'dozen', 'डझन': 'dozen'
  });
  var UNIT_FAMILY = { kg: 'kg', g: 'kg', litre: 'litre', ml: 'litre', packet: 'count', piece: 'count', dozen: 'count' };
  var UNIT_FACTOR = { kg: 1, g: 0.001, litre: 1, ml: 0.001, packet: 1, piece: 1, dozen: 12 };

  var CURRENCY = set(['₹', 'rs', 'rupaye', 'rupaya', 'rupay', 'rupee', 'rupees', 'rupiye', 'rupye', 'rupya',
    'rupe', 'inr', 'रुपये', 'रुपए', 'रुपया', 'रुपयांना', 'रुपयाचे', 'रु', 'ரூபாய்', 'ருபாய்', 'roobai', 'rubai']);

  var SEPARATORS = set([',', 'aur', 'and', 'ani', 'aani', 'matrum', 'और', 'आणि', 'மற்றும்', 'plus', 'phir']);

  var KW = {
    sale: set(['becha', 'beche', 'bechi', 'bech', 'bechaa', 'bechna', 'bika', 'bike', 'biki', 'bikri', 'sold',
      'sell', 'sale', 'sales', 'vikla', 'vikle', 'vikli', 'vikri', 'vikat', 'vittren', 'vitten', 'vithen',
      'बेचा', 'बेचे', 'बेची', 'बेच', 'बिका', 'बिके', 'बिकी', 'बिक्री', 'विकले', 'विकला', 'विकली', 'विक्री',
      'விற்றேன்', 'விற்பனை', 'வித்தேன்']),
    purchase: set(['mangwaya', 'mangvaya', 'mangaya', 'mangwaye', 'mangwayi', 'mangaaya', 'kharida', 'kharide',
      'kharidi', 'kharid', 'khareeda', 'khareede', 'bought', 'purchase', 'purchased', 'laya', 'laaya', 'laye',
      'laaye', 'ghetla', 'ghetle', 'ghetli', 'aanla', 'aanle', 'anla', 'vaanginen',
      'मंगवाया', 'मंगाया', 'मँगवाया', 'खरीदा', 'खरीदे', 'खरीदी', 'ख़रीदा', 'लाया', 'लाए', 'लाये', 'घेतला',
      'घेतले', 'घेतली', 'आणला', 'आणले', 'வாங்கினேன்', 'வாங்கியது']),
    expense: set(['diya', 'diye', 'dia', 'die', 'kharcha', 'kharch', 'kharche', 'expense', 'expenses',
      'spent', 'paid', 'pay', 'bhara', 'bhare', 'dila', 'dile', 'dili', 'kuduthen', 'selavu',
      'दिया', 'दिए', 'दिये', 'खर्च', 'खर्चा', 'खर्चे', 'भरा', 'भरे', 'दिला', 'दिले', 'दिली',
      'செலவு', 'கொடுத்தேன்']),
    question: set(['kitna', 'kitne', 'kitni', 'kitnaa', 'kya', 'how', 'what', 'kiti', 'kitee', 'kevdha',
      'evvalavu', 'ethana', 'kaun', 'कितना', 'कितने', 'कितनी', 'क्या', 'किती', 'केवढा', 'எவ்வளவு', 'எத்தனை']),
    profit: set(['munafa', 'munaafa', 'munafaa', 'munafe', 'nafa', 'naffa', 'nafaa', 'fayda', 'faayda',
      'faida', 'fayada', 'profit', 'kamai', 'kamaai', 'labh', 'laabh', 'labham', 'नफा', 'नफ़ा', 'मुनाफा',
      'मुनाफ़ा', 'फायदा', 'फ़ायदा', 'कमाई', 'लाभ', 'லாபம்']),
    stock: set(['bache', 'bacha', 'bachi', 'bacche', 'bachaa', 'baki', 'baaki', 'left', 'remaining', 'stock',
      'shillak', 'urla', 'urle', 'urli', 'meedhi', 'mitham', 'बचे', 'बचा', 'बची', 'बाकी', 'बाक़ी',
      'शिल्लक', 'उरले', 'उरला', 'மீதி', 'ஸ்டாக்']),
    report: set(['hisaab', 'hisab', 'hishob', 'hisob', 'report', 'summary', 'kanakku', 'हिसाब', 'हिशोब',
      'கணக்கு']),
    undo: set(['hatao', 'hata', 'hatado', 'hataiye', 'hatana', 'mitao', 'mita', 'undo', 'delete', 'remove',
      'kaadha', 'kadha', 'kadhun', 'kaadhun', 'kaadh', 'neekku', 'हटाओ', 'हटा', 'हटाइए', 'हटाना',
      'मिटाओ', 'काढा', 'काढून', 'நீக்கு']),
    setup: set(['setup', 'सेटअप']),
    yes: set(['haan', 'han', 'haa', 'ha', 'haanji', 'hanji', 'haji', 'ho', 'hoy', 'yes', 'yeah', 'yep', 'ok',
      'okay', 'theek', 'thik', 'thick', 'sahi', 'bilkul', 'correct', 'right', 'barobar', 'aamaa', 'aama',
      'aamam', 'sari', 'seri', 'हाँ', 'हां', 'हा', 'हो', 'ठीक', 'सही', 'बरोबर', 'बिल्कुल', 'ஆமா', 'ஆமாம்',
      'சரி']),
    no: set(['nahi', 'nahin', 'nai', 'na', 'no', 'nope', 'galat', 'nako', 'naahi', 'nahee', 'illa', 'illai',
      'venda', 'नहीं', 'नही', 'ना', 'नको', 'नाही', 'गलत', 'ग़लत', 'இல்லை', 'வேண்டாம்']),
    cancel: set(['cancel', 'rehne', 'rahne', 'chhodo', 'chodo', 'ruko', 'stop', 'radd', 'raddh', 'band',
      'रहने', 'छोड़ो', 'छोडो', 'रद्द', 'राहू']),
    skip: set(['sab', 'sabhi', 'saare', 'sare', 'all', 'everything', 'skip', 'sagla', 'sagle', 'sagli', 'ellam',
      'ellaam', 'pata', 'malum', 'सब', 'सभी', 'सारे', 'सगळे', 'सगळं', 'पता', 'எல்லாம்']),
    first: set(['pehla', 'pahla', 'pehle', 'pahila', 'first', 'pehlewala', 'पहला', 'पहिला', 'முதல்']),
    second: set(['doosra', 'dusra', 'doosre', 'dusri', 'dusara', 'second', 'दूसरा', 'दुसरा', 'இரண்டாவது']),
    third: set(['teesra', 'tisra', 'teesri', 'third', 'तीसरा', 'तिसरा', 'மூன்றாவது'])
  };

  var CATEGORIES = {
    transport: set(['transport', 'gaadi', 'gadi', 'auto', 'tempo', 'rickshaw', 'riksha', 'bhada', 'bhaada', 'petrol',
      'diesel', 'delivery', 'safar', 'travel', 'गाड़ी', 'गाडी', 'भाड़ा', 'भाडा', 'ऑटो', 'टेम्पो', 'पेट्रोल',
      'போக்குவரத்து']),
    rent: set(['rent', 'kiraya', 'kiraaya', 'bhade', 'vaadagai', 'किराया', 'भाडे', 'வாடகை']),
    electricity: set(['bijli', 'bijlee', 'light', 'electricity', 'current', 'vij', 'veej', 'karant', 'बिजली',
      'लाइट', 'वीज', 'மின்சாரம்']),
    salary: set(['salary', 'pagaar', 'pagar', 'tankhwah', 'tankha', 'majduri', 'majdoori', 'mazdoori', 'naukar',
      'helper', 'sambalam', 'वेतन', 'तनख्वाह', 'मजदूरी', 'पगार', 'சம்பளம்']),
    tea: set(['chai', 'chaay', 'tea', 'nashta', 'naashta', 'khana', 'tiffin', 'chaha', 'चाय', 'नाश्ता', 'चहा',
      'டீ']),
    packing: set(['packing', 'thaili', 'thaila', 'polythene', 'bag', 'bags', 'carrybag', 'थैली', 'पैकिंग'])
  };

  var STOP = set(['aaj', 'aj', 'aaje', 'today', 'kal', 'ke', 'ka', 'ki', 'ko', 'se', 'me', 'mein', 'main', 'mai',
    'mujhe', 'maine', 'mene', 'ne', 'liye', 'lie', 'liya', 'hai', 'hain', 'he', 'tha', 'the', 'thi', 'hua',
    'hui', 'hue', 'gaya', 'gaye', 'gayi', 'gai', 'ye', 'yeh', 'wo', 'woh', 'ya', 'or', 'a', 'an', 'of', 'for',
    'to', 'i', 'is', 'in', 'on', 'my', 'me', 'we', 'it', 'at', 'did', 'have', 'has', 'was', 'were', 'mi', 'la',
    'na', 'chi', 'cha', 'che', 'ne', 'naa', 'ku', 'oru', 'kitna', 'ab', 'abhi', 'bhai', 'ji', 'sir', 'madam',
    'pichhla', 'pichla', 'pichhli', 'pichli', 'last', 'aakhri', 'akhri', 'maagil', 'magil', 'wala', 'wale',
    'wali', 'batao', 'bataiye', 'bolo', 'sunao', 'tell', 'please', 'plz', 'kar', 'karo', 'kiya', 'kiye', 'ho',
    'hoga', 'raha', 'rahe', 'rahi', 'bas', 'total', 'amount', 'rate', 'daam', 'dam', 'paisa', 'paise', 'qty',
    'quantity', 'matra', 'jitna', 'jitne', 'sabko', 'mera', 'meri', 'mere', 'apna', 'unit', 'dukaan', 'dukan',
    'shop', 'store', 'hamari', 'hamara', 'bhi', 'toh', 'to', 'tho', 'aaya', 'aaye', 'aayi', 'mila', 'mile',
    'आज', 'के', 'का', 'की', 'को', 'से', 'में', 'मैंने', 'ने', 'लिए', 'है', 'हैं', 'था', 'थे', 'थी', 'हुआ',
    'हुई', 'हुए', 'गया', 'गए', 'गई', 'और', 'या', 'मी', 'ला', 'चे', 'ची', 'चा', 'पिछला', 'पिछली', 'आख़िरी',
    'बताओ', 'बताइए', 'वाला', 'वाले', 'वाली', 'भी', 'तो', 'साठी', 'இன்று', 'நான்', 'கு', 'ஒரு']);

  function addAll(target, s) { s.forEach(function (w) { target.add(w); }); }
  Object.keys(KW).forEach(function (k) { addAll(STOP, KW[k]); });
  Object.keys(CATEGORIES).forEach(function (k) { addAll(STOP, CATEGORIES[k]); });
  addAll(STOP, CURRENCY);
  addAll(STOP, SEPARATORS);
  addAll(STOP, HUNDRED);
  NUM.forEach(function (v, k) { STOP.add(k); });
  BIG.forEach(function (v, k) { STOP.add(k); });
  UNITS.forEach(function (v, k) { STOP.add(k); });

  // ---------- classification ----------
  function classify(tokens) {
    return groupNumbers(tokens).map(function (tok) {
      if (tok.kind === 'num') return tok;
      var t = tok.t;
      if (SEPARATORS.has(t)) return { kind: 'sep', t: t };
      if (CURRENCY.has(t)) return { kind: 'cur', t: t };
      if (UNITS.has(t)) return { kind: 'unit', t: t, unit: UNITS.get(t) };
      return { kind: 'word', t: t };
    });
  }

  function hasAny(toks, wordSet) {
    for (var i = 0; i < toks.length; i++) if (toks[i].t && wordSet.has(toks[i].t)) return true;
    return false;
  }

  function categoryOf(toks) {
    var keys = Object.keys(CATEGORIES);
    for (var i = 0; i < toks.length; i++) {
      for (var k = 0; k < keys.length; k++) {
        if (toks[i].kind === 'word' && CATEGORIES[keys[k]].has(toks[i].t)) return keys[k];
      }
    }
    return null;
  }

  // ---------- fuzzy matching ----------
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], curr = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      curr = [i];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = curr;
    }
    return prev[b.length];
  }

  function similarity(a, b) {
    var len = Math.max(a.length, b.length);
    return len ? 1 - levenshtein(a, b) / len : 1;
  }

  var FUZZY_MIN = 0.6;

  // Best-scoring items for an unknown word: [{id, score}], top `limit`, never a guess.
  function fuzzyCandidates(word, items, limit) {
    var w = normalize(word);
    var scored = [];
    (items || []).forEach(function (it) {
      var best = 0;
      (it.aliases || []).concat([it.say || '', it.id]).forEach(function (al) {
        var a = normalize(al);
        if (!a || a.indexOf(' ') >= 0) return;
        var s = similarity(w, a);
        if (s > best) best = s;
      });
      if (best >= FUZZY_MIN) scored.push({ id: it.id, score: Math.round(best * 100) / 100 });
    });
    scored.sort(function (x, y) { return y.score - x.score; });
    return scored.slice(0, limit || 3);
  }

  function aliasIndex(items) {
    var idx = new Map();
    var maxWords = 1;
    (items || []).forEach(function (it) {
      (it.aliases || []).concat([it.say || '', it.id]).forEach(function (al) {
        var a = normalize(al);
        if (!a) return;
        if (!idx.has(a)) idx.set(a, it.id);
        maxWords = Math.max(maxWords, a.split(' ').length);
      });
    });
    return { idx: idx, maxWords: maxWords };
  }

  // Marks item mentions on classified tokens: exact alias (multi-word first), else fuzzy.
  function findItems(toks, items) {
    var ai = aliasIndex(items);
    var mentions = [];
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].kind !== 'word') continue;
      var matched = false;
      for (var n = Math.min(ai.maxWords, toks.length - i); n >= 1 && !matched; n--) {
        var parts = [];
        for (var k = 0; k < n; k++) {
          if (toks[i + k].kind !== 'word') break;
          parts.push(toks[i + k].t);
        }
        if (parts.length !== n) continue;
        var id = ai.idx.get(parts.join(' '));
        if (id) {
          mentions.push({ index: i, itemId: id });
          i += n - 1;
          matched = true;
        }
      }
      if (matched) continue;
      var t = toks[i].t;
      if (STOP.has(t) || t.length < 4) continue;
      var cands = fuzzyCandidates(t, items, 3);
      if (cands.length) mentions.push({ index: i, candidates: cands.map(function (c) { return c.id; }), heard: t });
    }
    return mentions;
  }

  // ---------- transactions ----------
  var STOCK_IN = set(['stock', 'maal', 'saman', 'samaan', 'माल', 'सामान', 'स्टॉक']);
  addAll(STOP, STOCK_IN);

  function detectType(toks, hasItem) {
    if (hasAny(toks, KW.purchase)) return 'purchase';
    if (hasAny(toks, KW.sale)) return 'sale';
    if (hasAny(toks, KW.expense)) return hasItem ? 'purchase' : 'expense';
    if (hasItem && hasAny(toks, STOCK_IN)) return 'purchase';
    return null;
  }

  function convertQty(qty, unitSaid, item) {
    if (qty == null) return null;
    if (!unitSaid || !item) return qty;
    var fam = UNIT_FAMILY[unitSaid];
    var itemFam = UNIT_FAMILY[item.unit];
    if (fam && fam === itemFam) {
      var v = qty * UNIT_FACTOR[unitSaid] / (UNIT_FACTOR[item.unit] || 1);
      return Math.round(v * 1000) / 1000;
    }
    return qty;
  }

  // Reads quantity (number + unit, or number before the item) and amount
  // (number with ₹/rupaye, or any other leftover number).
  function extractNumbers(toks, itemIndex) {
    var qty = null, qtyUnit = null, amount = null, loose = [];
    toks.forEach(function (tok, i) {
      if (tok.kind !== 'num') return;
      var next = toks[i + 1], prev = toks[i - 1];
      if (next && next.kind === 'unit') {
        if (qty == null) { qty = tok.n; qtyUnit = next.unit; } else loose.push({ i: i, n: tok.n });
      } else if ((next && next.kind === 'cur') || (prev && prev.kind === 'cur')) {
        if (amount == null) amount = tok.n; else loose.push({ i: i, n: tok.n });
      } else {
        loose.push({ i: i, n: tok.n });
      }
    });
    loose.forEach(function (l) {
      if (qty == null && itemIndex != null && l.i < itemIndex) qty = l.n;
      else if (amount == null) amount = l.n;
      else if (qty == null) qty = l.n;
    });
    return { qty: qty, qtyUnit: qtyUnit, amount: amount };
  }

  function buildCard(toks, items, type) {
    var mentions = findItems(toks, items);
    var m = mentions[0] || null;
    var nums = extractNumbers(toks, m ? m.index : null);
    var card = {
      type: type,
      itemId: m && m.itemId ? m.itemId : null,
      candidates: m && m.candidates ? m.candidates : null,
      heard: m && m.heard ? m.heard : null,
      qty: null,
      amount: nums.amount,
      category: null
    };
    if (type === 'expense') {
      card.category = categoryOf(toks) || 'other';
      card.itemId = null;
      card.candidates = null;
      card.heard = null;
    } else {
      var item = (items || []).filter(function (it) { return it.id === card.itemId; })[0];
      card.qty = convertQty(nums.qty, nums.qtyUnit, item);
      card.qtyUnit = nums.qtyUnit;
    }
    card.missing = missingFields(card);
    return card;
  }

  function missingFields(card) {
    var miss = [];
    if (card.type !== 'expense') {
      if (!card.itemId) miss.push('item');
      if (card.qty == null) miss.push('qty');
    }
    if (card.amount == null) miss.push('amount');
    return miss;
  }

  function splitSegments(toks) {
    var segs = [[]];
    toks.forEach(function (t) {
      if (t.kind === 'sep') { if (segs[segs.length - 1].length) segs.push([]); }
      else segs[segs.length - 1].push(t);
    });
    return segs.filter(function (s) { return s.length; });
  }

  function parseTransactions(toks, items) {
    var segs = splitSegments(toks).map(function (s) {
      return { toks: s, hasItem: findItems(s, items).length > 0, cat: categoryOf(s), hasNum: s.some(function (t) { return t.kind === 'num'; }) };
    });
    var anyItem = segs.some(function (s) { return s.hasItem; });
    var globalType = detectType(toks, anyItem);

    // Merge pieces that are not a transaction on their own into their neighbour.
    var merged = [];
    segs.forEach(function (s) {
      var standalone = s.hasItem || (s.cat && s.hasNum);
      if (standalone || !merged.length) merged.push(s);
      else {
        var last = merged[merged.length - 1];
        last.toks = last.toks.concat(s.toks);
        last.hasNum = last.hasNum || s.hasNum;
        last.cat = last.cat || s.cat;
      }
    });
    // A leading fragment with no item/category (e.g. "aaj") belongs to the next piece.
    if (merged.length > 1 && !merged[0].hasItem && !(merged[0].cat && merged[0].hasNum)) {
      merged[1].toks = merged[0].toks.concat(merged[1].toks);
      merged[1].hasNum = merged[1].hasNum || merged[0].hasNum;
      merged.shift();
    }

    var cards = [];
    merged.forEach(function (s) {
      var type = detectType(s.toks, s.hasItem) || globalType;
      if (type === 'expense' && s.hasItem) type = 'purchase';
      if (!type) type = s.hasItem ? 'sale' : (s.cat ? 'expense' : null);
      if (type === 'sale' && !s.hasItem && s.cat) type = 'expense';
      if (!type) return;
      cards.push(buildCard(s.toks, items, type));
    });
    return cards;
  }

  // ---------- main entry ----------
  function parse(text, items) {
    var isQ = /\?/.test(String(text || ''));
    var toks = classify(tokenize(text));
    if (!toks.length) return { intent: 'empty', cards: [] };
    var question = isQ || hasAny(toks, KW.question);
    var txVerb = hasAny(toks, KW.sale) || hasAny(toks, KW.purchase) || hasAny(toks, KW.expense);
    var hasNum = toks.some(function (t) { return t.kind === 'num'; });

    if (hasAny(toks, KW.undo)) return { intent: 'undo', cards: [] };
    if (hasAny(toks, KW.setup)) return { intent: 'setup', cards: [] };
    if (hasAny(toks, KW.profit)) return { intent: 'query_profit', cards: [] };
    if (hasAny(toks, KW.report)) return { intent: 'report', cards: [] };
    if (hasAny(toks, KW.stock) && (question || !txVerb) && !hasNum) {
      var m = findItems(toks, items)[0];
      return { intent: 'query_stock', cards: [], itemId: m && m.itemId || null, candidates: m && m.candidates || null };
    }
    if (question && !hasNum) {
      if (hasAny(toks, KW.sale)) return { intent: 'query_sales', cards: [] };
      if (hasAny(toks, KW.expense)) return { intent: 'query_expense', cards: [] };
      var mq = findItems(toks, items)[0];
      if (mq) return { intent: 'query_stock', cards: [], itemId: mq.itemId || null, candidates: mq.candidates || null };
      return { intent: 'report', cards: [] };
    }
    var cards = parseTransactions(toks, items);
    if (cards.length) return { intent: 'transaction', cards: cards };
    return { intent: 'unknown', cards: [] };
  }

  // Reply during confirmation: yes / no / correction like "nahi, 400 hai" or "nahi 6 kilo".
  function parseCorrection(toks, items) {
    var c = {};
    var mentions = findItems(toks, items);
    var m = mentions[0];
    var nums = extractNumbers(toks, null);
    // In a correction a bare number is the amount; a number followed by a unit is the quantity.
    if (nums.qty != null && nums.qtyUnit) { c.qty = nums.qty; c.qtyUnit = nums.qtyUnit; }
    if (nums.amount != null) c.amount = nums.amount;
    if (m && m.itemId) c.itemId = m.itemId;
    else if (m && m.candidates) { c.candidates = m.candidates; c.heard = m.heard; }
    var cat = categoryOf(toks);
    if (cat) c.category = cat;
    var type = hasAny(toks, KW.purchase) ? 'purchase' : (hasAny(toks, KW.sale) ? 'sale' : null);
    if (type) c.type = type;
    return Object.keys(c).length ? c : null;
  }

  function yesNo(text) {
    var toks = classify(tokenize(text));
    if (hasAny(toks, KW.no)) return 'no';
    if (hasAny(toks, KW.yes)) return 'yes';
    return null;
  }

  function parseConfirm(text, items) {
    var toks = classify(tokenize(text));
    var answer = hasAny(toks, KW.no) ? 'no' : (hasAny(toks, KW.yes) ? 'yes' : null);
    return { answer: answer, correction: parseCorrection(toks, items), cancel: hasAny(toks, KW.cancel) };
  }

  function isCancel(text) {
    return hasAny(classify(tokenize(text)), KW.cancel);
  }

  function isSkip(text) {
    return hasAny(classify(tokenize(text)), KW.skip);
  }

  // Number plus optional unit, for answering "Kitne kilo?" / "Kitne rupaye?".
  function parseQuantity(text) {
    var toks = classify(tokenize(text));
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].kind === 'num') {
        var next = toks[i + 1];
        return { value: toks[i].n, unit: next && next.kind === 'unit' ? next.unit : null };
      }
    }
    return null;
  }

  function parseUnitWord(text) {
    var toks = classify(tokenize(text));
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].kind === 'unit') {
        var u = toks[i].unit;
        return u === 'g' ? 'kg' : u === 'ml' ? 'litre' : u === 'dozen' ? 'piece' : u;
      }
    }
    return null;
  }

  // Choosing among candidate items by name, ordinal ("pehla") or yes for a single option.
  function pickCandidate(text, ids, items) {
    var toks = classify(tokenize(text));
    var pool = (items || []).filter(function (it) { return ids.indexOf(it.id) >= 0; });
    var mentions = findItems(toks, pool);
    for (var i = 0; i < mentions.length; i++) {
      if (mentions[i].itemId) return mentions[i].itemId;
    }
    if (hasAny(toks, KW.first)) return ids[0] || null;
    if (hasAny(toks, KW.second)) return ids[1] || null;
    if (hasAny(toks, KW.third)) return ids[2] || null;
    if (ids.length === 1 && hasAny(toks, KW.yes) && !hasAny(toks, KW.no)) return ids[0];
    for (var k = 0; k < mentions.length; k++) {
      if (mentions[k].candidates && mentions[k].candidates.length === 1) return mentions[k].candidates[0];
    }
    return null;
  }

  // Exact item mentions (for setup: "chawal, dal aur tel").
  function mentionedItems(text, items) {
    var ids = [];
    findItems(classify(tokenize(text)), items).forEach(function (m) {
      if (m.itemId && ids.indexOf(m.itemId) < 0) ids.push(m.itemId);
    });
    return ids;
  }

  // Picks the fixed template whose keywords best match the shop description.
  function matchTemplate(text, templates) {
    var toks = tokenize(text);
    var best = 'kirana', bestScore = 0;
    Object.keys(templates).forEach(function (id) {
      var kws = set(templates[id].keywords || []);
      var itemIdx = aliasIndex(templates[id].items).idx;
      var score = 0;
      toks.forEach(function (t) {
        if (kws.has(t)) score += 2;
        else if (itemIdx.has(t)) score += 1;
      });
      if (score > bestScore) { best = id; bestScore = score; }
    });
    return best;
  }

  return {
    normalize: normalize,
    tokenize: tokenize,
    groupNumbers: groupNumbers,
    parseNumber: parseNumber,
    parseQuantity: parseQuantity,
    parseUnitWord: parseUnitWord,
    levenshtein: levenshtein,
    similarity: similarity,
    fuzzyCandidates: fuzzyCandidates,
    convertQty: convertQty,
    missingFields: missingFields,
    parse: parse,
    parseConfirm: parseConfirm,
    yesNo: yesNo,
    isCancel: isCancel,
    isSkip: isSkip,
    pickCandidate: pickCandidate,
    mentionedItems: mentionedItems,
    matchTemplate: matchTemplate
  };
});
