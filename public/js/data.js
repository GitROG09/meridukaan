/*
 * MeriDukaan - data.js
 * Fixed, pre-tested shop templates (setup only fills these; no code is generated)
 * and seed data for first launch.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Data = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Item fields: id, name (screen), say (spoken), unit (kg|litre|packet|piece),
  // buy/sell (rupees per unit), opening stock, low-stock limit, aliases in
  // Hinglish / Hindi / Marathi / Tamil / English, service (no stock tracking).
  var TEMPLATES = {
    kirana: {
      id: 'kirana',
      label: 'Kirana dukaan',
      keywords: ['kirana', 'kiraana', 'grocery', 'general', 'provision', 'ration', 'kirane', 'maligai', 'malligai',
        'किराना', 'किराणा', 'राशन', 'மளிகை'],
      sample: { text: 'Aaj paanch kilo chawal teen sau rupaye mein beche', type: 'sale', itemId: 'rice', qty: 5, amount: 300 },
      items: [
        { id: 'rice', name: 'Chawal (Rice)', say: 'chawal', unit: 'kg', buy: 40, sell: 60, opening: 50, low: 5,
          aliases: ['rice', 'chawal', 'chaawal', 'chawel', 'tandul', 'tandool', 'arisi', 'arishi',
            'चावल', 'तांदूळ', 'तांदुळ', 'அரிசி'] },
        { id: 'atta', name: 'Atta (Wheat flour)', say: 'atta', unit: 'kg', buy: 32, sell: 40, opening: 40, low: 5,
          aliases: ['atta', 'aata', 'aatta', 'flour', 'wheat', 'gehun', 'gehu', 'peeth', 'kanik', 'godhumai',
            'maavu', 'आटा', 'गेहूं', 'गेहूँ', 'पीठ', 'कणीक', 'கோதுமை', 'மாவு'] },
        { id: 'sugar', name: 'Cheeni (Sugar)', say: 'cheeni', unit: 'kg', buy: 40, sell: 50, opening: 30, low: 5,
          aliases: ['sugar', 'cheeni', 'chini', 'shakkar', 'sakhar', 'sakkarai', 'sarkarai', 'चीनी', 'शक्कर',
            'साखर', 'சர்க்கரை'] },
        { id: 'dal', name: 'Toor Dal', say: 'dal', unit: 'kg', buy: 110, sell: 140, opening: 20, low: 3,
          aliases: ['dal', 'daal', 'dhal', 'toor', 'tur', 'tuvar', 'arhar', 'paruppu', 'toor dal', 'tur dal',
            'arhar dal', 'दाल', 'तूर', 'अरहर', 'डाळ', 'பருப்பு', 'துவரம் பருப்பு'] },
        { id: 'chana', name: 'Chana (Chickpea)', say: 'chana', unit: 'kg', buy: 70, sell: 90, opening: 20, low: 3,
          aliases: ['chana', 'channa', 'chickpea', 'chickpeas', 'harbhara', 'kadalai', 'चना', 'चणा', 'हरभरा',
            'கடலை'] },
        { id: 'oil', name: 'Tel (Cooking oil)', say: 'tel', unit: 'litre', buy: 120, sell: 150, opening: 15, low: 3,
          aliases: ['oil', 'tel', 'tail', 'ennai', 'ennei', 'तेल', 'எண்ணெய்'] },
        { id: 'biscuit', name: 'Biscuit', say: 'biscuit', unit: 'packet', buy: 8, sell: 10, opening: 40, low: 10,
          aliases: ['biscuit', 'biscuits', 'biskut', 'biskit', 'biscut', 'बिस्कुट', 'बिस्किट', 'பிஸ்கட்'] },
        { id: 'milk', name: 'Doodh (Milk)', say: 'doodh', unit: 'litre', buy: 50, sell: 60, opening: 20, low: 5,
          aliases: ['milk', 'doodh', 'dudh', 'dhoodh', 'paal', 'दूध', 'दुध', 'பால்'] }
      ]
    },
    sabzi: {
      id: 'sabzi',
      label: 'Sabzi thela',
      keywords: ['sabzi', 'sabji', 'subzi', 'sabjee', 'vegetable', 'vegetables', 'bhaji', 'bhaaji', 'tarkari',
        'thela', 'kaykari', 'सब्जी', 'सब्ज़ी', 'भाजी', 'ठेला', 'காய்கறி'],
      sample: { text: 'do kilo aloo saath rupaye mein beche', type: 'sale', itemId: 'potato', qty: 2, amount: 60 },
      items: [
        { id: 'potato', name: 'Aloo (Potato)', say: 'aloo', unit: 'kg', buy: 20, sell: 30, opening: 50, low: 5,
          aliases: ['aloo', 'alu', 'aaloo', 'potato', 'potatoes', 'batata', 'urulai', 'आलू', 'बटाटा', 'உருளைக்கிழங்கு'] },
        { id: 'onion', name: 'Pyaz (Onion)', say: 'pyaz', unit: 'kg', buy: 25, sell: 35, opening: 50, low: 5,
          aliases: ['pyaz', 'pyaaz', 'piyaz', 'onion', 'onions', 'kanda', 'kaanda', 'vengayam', 'प्याज', 'कांदा',
            'வெங்காயம்'] },
        { id: 'tomato', name: 'Tamatar (Tomato)', say: 'tamatar', unit: 'kg', buy: 20, sell: 30, opening: 30, low: 5,
          aliases: ['tamatar', 'tamaatar', 'tomato', 'tomatoes', 'thakkali', 'टमाटर', 'टोमॅटो', 'தக்காளி'] },
        { id: 'chilli', name: 'Hari Mirch (Chilli)', say: 'mirchi', unit: 'kg', buy: 40, sell: 60, opening: 5, low: 1,
          aliases: ['mirchi', 'mirch', 'chilli', 'chili', 'milagai', 'मिर्च', 'मिर्ची', 'मिरची', 'மிளகாய்'] },
        { id: 'coriander', name: 'Dhaniya (Coriander)', say: 'dhaniya', unit: 'piece', buy: 5, sell: 10, opening: 30, low: 5,
          aliases: ['dhaniya', 'dhania', 'coriander', 'kothimbir', 'kothamalli', 'धनिया', 'कोथिंबीर', 'கொத்தமல்லி'] }
      ]
    },
    tailor: {
      id: 'tailor',
      label: 'Darzi / Tailor',
      keywords: ['tailor', 'darzi', 'darji', 'silai', 'silaai', 'stitching', 'shimpi', 'boutique', 'kapde', 'taiyal',
        'दर्जी', 'सिलाई', 'शिंपी', 'தையல்'],
      sample: { text: 'do blouse paanch sau rupaye', type: 'sale', itemId: 'blouse', qty: 2, amount: 500 },
      items: [
        { id: 'blouse', name: 'Blouse silai', say: 'blouse', unit: 'piece', buy: 50, sell: 250, opening: 0, service: true,
          aliases: ['blouse', 'blouj', 'ब्लाउज', 'ரவிக்கை'] },
        { id: 'pant', name: 'Pant silai', say: 'pant', unit: 'piece', buy: 60, sell: 300, opening: 0, service: true,
          aliases: ['pant', 'pants', 'patloon', 'पैंट', 'पॅन्ट'] },
        { id: 'shirt', name: 'Shirt silai', say: 'shirt', unit: 'piece', buy: 50, sell: 250, opening: 0, service: true,
          aliases: ['shirt', 'kameez', 'कमीज', 'शर्ट', 'சட்டை'] },
        { id: 'kurta', name: 'Kurta silai', say: 'kurta', unit: 'piece', buy: 70, sell: 350, opening: 0, service: true,
          aliases: ['kurta', 'kurti', 'कुर्ता', 'कुर्ती'] },
        { id: 'thread', name: 'Dhaga (Thread reel)', say: 'dhaga', unit: 'piece', buy: 10, sell: 15, opening: 40, low: 5,
          aliases: ['dhaga', 'dhaaga', 'thread', 'dora', 'धागा', 'दोरा', 'நூல்'] },
        { id: 'button', name: 'Button', say: 'button', unit: 'packet', buy: 10, sell: 15, opening: 20, low: 5,
          aliases: ['button', 'buttons', 'batan', 'बटन', 'பட்டன்'] }
      ]
    },
    food: {
      id: 'food',
      label: 'Chai-nashta stall',
      keywords: ['stall', 'hotel', 'dhaba', 'samosa', 'vada', 'pav', 'poha', 'food', 'canteen', 'idli', 'dosa',
        'tapri', 'nashta', 'chai', 'tea', 'चाय', 'नाश्ता', 'समोसा', 'टपरी', 'வடை', 'டீ', 'சாப்பாடு'],
      sample: { text: 'das chai sau rupaye mein beche', type: 'sale', itemId: 'chai', qty: 10, amount: 100 },
      items: [
        { id: 'chai', name: 'Chai (Tea)', say: 'chai', unit: 'piece', buy: 4, sell: 10, opening: 0, service: true,
          aliases: ['chai', 'chaay', 'chaha', 'tea', 'चाय', 'चहा', 'டீ'] },
        { id: 'coffee', name: 'Coffee', say: 'coffee', unit: 'piece', buy: 6, sell: 15, opening: 0, service: true,
          aliases: ['coffee', 'kaapi', 'kapi', 'कॉफी', 'காபி'] },
        { id: 'samosa', name: 'Samosa', say: 'samosa', unit: 'piece', buy: 6, sell: 15, opening: 0, service: true,
          aliases: ['samosa', 'samose', 'samosha', 'समोसा', 'समोसे'] },
        { id: 'vadapav', name: 'Vada Pav', say: 'vada pav', unit: 'piece', buy: 8, sell: 20, opening: 0, service: true,
          aliases: ['vada pav', 'wada pav', 'vadapav', 'vada', 'wada', 'वडा पाव', 'वडापाव', 'வடை'] },
        { id: 'poha', name: 'Poha (plate)', say: 'poha', unit: 'piece', buy: 10, sell: 25, opening: 0, service: true,
          aliases: ['poha', 'pohe', 'पोहा', 'पोहे'] },
        { id: 'water', name: 'Paani bottle', say: 'paani bottle', unit: 'piece', buy: 7, sell: 10, opening: 30, low: 5,
          aliases: ['bottle', 'paani', 'pani', 'water', 'बोतल', 'पानी', 'தண்ணீர்'] }
      ]
    }
  };

  var CATEGORY_LABELS = {
    transport: 'Transport',
    rent: 'Kiraya (Rent)',
    electricity: 'Bijli (Electricity)',
    salary: 'Majdoori (Salary)',
    tea: 'Chai-nashta',
    packing: 'Packing / thaili',
    other: 'Anya (Other)'
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // Fixed sample entries so every tab has something to show on first launch.
  function sampleEntries(now) {
    function at(daysAgo, h, m) {
      var d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(h, m, 0, 0);
      return d.getTime();
    }
    var rows = [
      [2, 10, 5, 'sale', 'chana', 3, 270, 70],
      [2, 12, 30, 'sale', 'rice', 10, 600, 40],
      [2, 18, 0, 'expense', null, null, 500, null, 'electricity'],
      [1, 9, 40, 'sale', 'dal', 2, 280, 110],
      [1, 11, 15, 'sale', 'oil', 1, 150, 120],
      [1, 17, 45, 'sale', 'milk', 3, 180, 50],
      [1, 19, 0, 'expense', null, null, 40, null, 'tea'],
      [0, 8, 30, 'purchase', 'atta', 10, 320, null],
      [0, 9, 15, 'sale', 'rice', 5, 300, 40],
      [0, 9, 50, 'sale', 'sugar', 2, 100, 40],
      [0, 10, 20, 'sale', 'biscuit', 4, 40, 8],
      [0, 10, 45, 'expense', null, null, 100, null, 'transport']
    ];
    return rows.map(function (r, i) {
      // Today's samples never sit in the future (keeps "last entry" and lists sensible early in the day).
      var ts = Math.min(at(r[0], r[1], r[2]), now - (rows.length - i) * 60000);
      var e = { id: 's' + (i + 1), ts: ts, type: r[3], amount: r[6] };
      if (r[4]) { e.itemId = r[4]; e.qty = r[5]; }
      if (r[7] != null) e.unitCost = r[7];
      if (r[8]) e.category = r[8];
      return e;
    });
  }

  function freshDb(templateId, now, withSamples) {
    var tpl = TEMPLATES[templateId] || TEMPLATES.kirana;
    return {
      version: 1,
      items: clone(tpl.items),
      entries: withSamples && tpl.id === 'kirana' ? sampleEntries(now) : [],
      settings: { lang: 'hi-IN', languageChosen: false, template: tpl.id, setupDone: false, eveningAsked: null },
      nextId: 1
    };
  }

  return {
    TEMPLATES: TEMPLATES,
    CATEGORY_LABELS: CATEGORY_LABELS,
    sampleEntries: sampleEntries,
    freshDb: freshDb,
    clone: clone
  };
});
