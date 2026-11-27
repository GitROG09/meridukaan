/*
 * MeriDukaan tests - no dependencies.  Run:  node tests/tests.js
 */
'use strict';
var assert = require('assert');
var path = require('path');
var Calc = require(path.join(__dirname, '..', 'public', 'js', 'calc.js'));
var Parser = require(path.join(__dirname, '..', 'public', 'js', 'parser.js'));
var Data = require(path.join(__dirname, '..', 'public', 'js', 'data.js'));

var ITEMS = Data.TEMPLATES.kirana.items;
function item(id) { return ITEMS.filter(function (i) { return i.id === id; })[0]; }

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
function section(name) { console.log('\n' + name); }
function one(text) {
  var r = Parser.parse(text, ITEMS);
  assert.strictEqual(r.intent, 'transaction', 'intent for "' + text + '" was ' + r.intent);
  assert.strictEqual(r.cards.length, 1, 'expected 1 card, got ' + r.cards.length);
  return r.cards[0];
}

section('Number words');
[
  ['teen sau', 300], ['do hazaar', 2000], ['do hazaar paanch sau', 2500], ['dedh sau', 150],
  ['dhai hazaar', 2500], ['paanch', 5], ['sau', 100], ['ek sau bees', 120], ['do sau pachaas', 250],
  ['twenty five', 25], ['three hundred', 300], ['teen lakh', 300000], ['300', 300], ['₹1,200', 1200],
  ['3,00,000', 300000], ['2 hazaar 500', 2500], ['तीन सौ', 300], ['दो हज़ार', 2000], ['पाँच', 5],
  ['तीनशे', 300], ['munnooru', 300], ['ஆயிரம்', 1000], ['१२०', 120], ['1.5', 1.5], ['aadha', 0.5],
  ['saade teen sau', 350], ['sawa sau', 125], ['paune do', 1.75], ['saade paanch hazaar', 5500], ['साढ़े तीन', 3.5]
].forEach(function (c) {
  test('"' + c[0] + '" = ' + c[1], function () { assert.strictEqual(Parser.parseNumber(c[0]), c[1]); });
});
test('separate digit numbers are not merged ("5 300")', function () {
  var nums = Parser.groupNumbers(Parser.tokenize('5 300')).filter(function (t) { return t.kind === 'num'; });
  assert.deepStrictEqual(nums.map(function (t) { return t.n; }), [5, 300]);
});
test('"hata do" does not read "do" as 2', function () {
  assert.strictEqual(Parser.parseNumber('pichhla hata do'), null);
});
test('"do kilo" still reads 2', function () {
  assert.strictEqual(Parser.parseNumber('do kilo'), 2);
});
test('setup associates units and prices with named items', function () {
  var items = ITEMS.filter(function (i) { return i.id === 'rice' || i.id === 'biscuit'; });
  assert.deepStrictEqual(Parser.parseSetupValues('chawal kilo aur biscuit packet', items, 'unit'), { rice: 'kg', biscuit: 'packet' });
  assert.deepStrictEqual(Parser.parseSetupValues('chawal 40, biscuit 8', items, 'price'), { rice: 40, biscuit: 8 });
  assert.deepStrictEqual(Parser.parseSetupValues('तांदूळ चाळीस आणि बिस्किट आठ', items, 'price'), { rice: 40, biscuit: 8 });
  assert.equal(Parser.isSkip('सर्व'), true);
  assert.deepStrictEqual(Parser.parseSetupValues('40', items, 'price'), {});
  assert.deepStrictEqual(Parser.parseSetupValues('40', [items[0]], 'price'), { rice: 40 });
});
test('"saade teen kilo chawal paune do sau" -> 3.5 kg, ₹175', function () {
  var c = one('saade teen kilo chawal paune do sau rupaye mein beche');
  assert.strictEqual(c.qty, 3.5);
  assert.strictEqual(c.amount, 175);
});

section('Sale parsing');
test('spec sentence -> Rice, 5 kg, ₹300, sale', function () {
  var c = one('Aaj paanch kilo chawal teen sau rupaye mein beche');
  assert.strictEqual(c.type, 'sale');
  assert.strictEqual(c.itemId, 'rice');
  assert.strictEqual(c.qty, 5);
  assert.strictEqual(c.amount, 300);
  assert.deepStrictEqual(c.missing, []);
});
test('digits and ₹ symbol', function () {
  var c = one('5kg chawal ₹300 becha');
  assert.strictEqual(c.qty, 5); assert.strictEqual(c.amount, 300); assert.strictEqual(c.itemId, 'rice');
});
test('Devanagari Hindi sentence', function () {
  var c = one('आज पाँच किलो चावल तीन सौ रुपये में बेचे');
  assert.strictEqual(c.type, 'sale'); assert.strictEqual(c.itemId, 'rice');
  assert.strictEqual(c.qty, 5); assert.strictEqual(c.amount, 300);
});
test('number before item without unit is quantity', function () {
  var c = one('teen biscuit tees rupaye mein beche');
  assert.strictEqual(c.itemId, 'biscuit'); assert.strictEqual(c.qty, 3); assert.strictEqual(c.amount, 30);
});
test('grams convert to kg', function () {
  var c = one('500 gram cheeni 25 rupaye mein bechi');
  assert.strictEqual(c.itemId, 'sugar'); assert.strictEqual(c.qty, 0.5); assert.strictEqual(c.amount, 25);
});
test('no verb but item -> sale', function () {
  var c = one('do kilo atta assi rupaye');
  assert.strictEqual(c.type, 'sale'); assert.strictEqual(c.itemId, 'atta'); assert.strictEqual(c.amount, 80);
});

section('Expense parsing');
test('"Transport ke liye sau rupaye diye" -> expense, transport, ₹100', function () {
  var c = one('Transport ke liye sau rupaye diye');
  assert.strictEqual(c.type, 'expense'); assert.strictEqual(c.category, 'transport');
  assert.strictEqual(c.amount, 100); assert.strictEqual(c.itemId, null);
});
test('electricity bill in Hindi', function () {
  var c = one('bijli ka bill paanch sau bhara');
  assert.strictEqual(c.type, 'expense'); assert.strictEqual(c.category, 'electricity'); assert.strictEqual(c.amount, 500);
});
test('unknown expense category -> other', function () {
  var c = one('300 rupaye kharcha hua');
  assert.strictEqual(c.type, 'expense'); assert.strictEqual(c.category, 'other'); assert.strictEqual(c.amount, 300);
});
test('two expenses in one sentence', function () {
  var r = Parser.parse('transport 100 aur chai 50 diye', ITEMS);
  assert.strictEqual(r.cards.length, 2);
  assert.strictEqual(r.cards[0].category, 'transport'); assert.strictEqual(r.cards[0].amount, 100);
  assert.strictEqual(r.cards[1].category, 'tea'); assert.strictEqual(r.cards[1].amount, 50);
});

section('Stock purchase parsing');
test('"20 kilo chawal mangwaya 800 diye" -> purchase', function () {
  var c = one('20 kilo chawal mangwaya 800 diye');
  assert.strictEqual(c.type, 'purchase'); assert.strictEqual(c.itemId, 'rice');
  assert.strictEqual(c.qty, 20); assert.strictEqual(c.amount, 800);
});
test('Marathi purchase "dha kilo sakhar ghetli"', function () {
  var c = one('daha kilo sakhar ghetli chaarshe rupaye');
  assert.strictEqual(c.type, 'purchase'); assert.strictEqual(c.itemId, 'sugar'); assert.strictEqual(c.qty, 10);
});
test('"stock aaya" with item -> purchase', function () {
  var c = one('10 packet biscuit ka stock aaya 80 rupaye');
  assert.strictEqual(c.type, 'purchase'); assert.strictEqual(c.itemId, 'biscuit'); assert.strictEqual(c.qty, 10);
  assert.strictEqual(c.amount, 80);
});

section('Multiple items in one sentence');
test('a shared total is not guessed as an individual item amount', function () {
  var r = Parser.parse('do kilo cheeni aur ek tel, dono saath mein 280', ITEMS);
  assert.equal(r.sharedTotal, true);
  assert.equal(r.cards.length, 2);
  assert.deepStrictEqual(r.cards.map(function (card) { return card.amount; }), [null, null]);
  assert.deepStrictEqual(r.cards.map(function (card) { return card.qty; }), [2, 1]);
  assert.equal(Parser.parseNumber('saath rupaye'), 60);
});
test('two items -> two sale cards', function () {
  var r = Parser.parse('do kilo cheeni sau rupaye aur teen packet biscuit tees rupaye mein beche', ITEMS);
  assert.strictEqual(r.intent, 'transaction');
  assert.strictEqual(r.cards.length, 2);
  assert.deepStrictEqual([r.cards[0].type, r.cards[0].itemId, r.cards[0].qty, r.cards[0].amount], ['sale', 'sugar', 2, 100]);
  assert.deepStrictEqual([r.cards[1].type, r.cards[1].itemId, r.cards[1].qty, r.cards[1].amount], ['sale', 'biscuit', 3, 30]);
});
test('sale and expense in one sentence', function () {
  var r = Parser.parse('ek litre tel 150 mein becha, transport ke liye 50 diye', ITEMS);
  assert.strictEqual(r.cards.length, 2);
  assert.strictEqual(r.cards[0].type, 'sale'); assert.strictEqual(r.cards[0].itemId, 'oil');
  assert.strictEqual(r.cards[1].type, 'expense'); assert.strictEqual(r.cards[1].amount, 50);
});
test('a fragment with only the price joins the previous item', function () {
  var r = Parser.parse('do kilo chawal aur teen sau rupaye', ITEMS);
  assert.strictEqual(r.cards.length, 1);
  assert.strictEqual(r.cards[0].qty, 2); assert.strictEqual(r.cards[0].amount, 300);
});

section('Mixed languages / item aliases');
['rice', 'chawal', 'tandul', 'arisi', 'चावल', 'तांदूळ', 'அரிசி'].forEach(function (w) {
  test('"' + w + '" -> rice', function () {
    var c = one('5 kilo ' + w + ' 300 rupaye becha');
    assert.strictEqual(c.itemId, 'rice');
  });
});
test('English sentence', function () {
  var c = one('sold 2 litre milk for 120 rupees');
  assert.strictEqual(c.itemId, 'milk'); assert.strictEqual(c.qty, 2); assert.strictEqual(c.amount, 120);
});

section('Fuzzy items (never guess)');
test('"chaval" -> candidates chawal, chana; no item chosen', function () {
  var c = one('paanch kilo chaval teen sau mein becha');
  assert.strictEqual(c.itemId, null);
  assert.deepStrictEqual(c.candidates.slice(0, 2), ['rice', 'chana']);
  assert.ok(c.candidates.length <= 3);
  assert.ok(c.missing.indexOf('item') >= 0);
});
test('fuzzyCandidates returns at most 3 sorted by score', function () {
  var c = Parser.fuzzyCandidates('chaval', ITEMS, 3);
  assert.ok(c.length >= 2 && c.length <= 3);
  assert.ok(c[0].score >= c[1].score);
});
test('unrelated word gives no candidates', function () {
  assert.deepStrictEqual(Parser.fuzzyCandidates('xyzzyq', ITEMS, 3), []);
});
test('pickCandidate by name, ordinal and yes', function () {
  assert.strictEqual(Parser.pickCandidate('chana', ['rice', 'chana'], ITEMS), 'chana');
  assert.strictEqual(Parser.pickCandidate('pehla wala', ['rice', 'chana'], ITEMS), 'rice');
  assert.strictEqual(Parser.pickCandidate('haan', ['rice'], ITEMS), 'rice');
  assert.strictEqual(Parser.pickCandidate('haan', ['rice', 'chana'], ITEMS), null);
});

section('Missing fields');
test('"chawal becha" -> missing qty and amount', function () {
  var c = one('chawal becha');
  assert.deepStrictEqual(c.missing, ['qty', 'amount']);
});
test('"paanch kilo chawal becha" -> missing amount only', function () {
  var c = one('paanch kilo chawal becha');
  assert.deepStrictEqual(c.missing, ['amount']);
});
test('"300 rupaye ka becha" -> missing item and qty', function () {
  var c = one('300 rupaye ka becha');
  assert.deepStrictEqual(c.missing, ['item', 'qty']);
});
test('"transport ka kharcha" -> missing amount', function () {
  var c = one('transport ka kharcha');
  assert.deepStrictEqual(c.missing, ['amount']);
});

section('Implausible amounts');
test('₹3,00,000 for 5 kg rice is implausible', function () {
  var c = one('paanch kilo chawal teen lakh rupaye mein becha');
  assert.strictEqual(c.amount, 300000);
  var p = Calc.checkPlausible(c, item('rice'));
  assert.strictEqual(p.ok, false); assert.strictEqual(p.reason, 'amount_high'); assert.strictEqual(p.field, 'amount');
});
test('₹300 for 5 kg rice is fine', function () {
  assert.strictEqual(Calc.checkPlausible({ type: 'sale', qty: 5, amount: 300 }, item('rice')).ok, true);
});
test('₹3 for 5 kg rice is too low', function () {
  assert.strictEqual(Calc.checkPlausible({ type: 'sale', qty: 5, amount: 3 }, item('rice')).reason, 'amount_low');
});
test('expense above limit is implausible, zero amount too', function () {
  assert.strictEqual(Calc.checkPlausible({ type: 'expense', amount: 100000 }, null).ok, false);
  assert.strictEqual(Calc.checkPlausible({ type: 'expense', amount: 0 }, null).ok, false);
  assert.strictEqual(Calc.checkPlausible({ type: 'expense', amount: 500 }, null).ok, true);
});
test('huge quantity is implausible', function () {
  assert.strictEqual(Calc.checkPlausible({ type: 'sale', qty: 50000, amount: 3000000 }, item('rice')).field, 'qty');
});

section('Confirmation replies');
test('"haan" = yes, "nahi" = no', function () {
  assert.strictEqual(Parser.parseConfirm('haan', ITEMS).answer, 'yes');
  assert.strictEqual(Parser.parseConfirm('हाँ सही है', ITEMS).answer, 'yes');
  assert.strictEqual(Parser.parseConfirm('nahi', ITEMS).answer, 'no');
  assert.strictEqual(Parser.parseConfirm('haan', ITEMS).correction, null);
});
test('"nahi, 400 hai" changes only the amount', function () {
  var r = Parser.parseConfirm('nahi, 400 hai', ITEMS);
  assert.strictEqual(r.answer, 'no');
  assert.deepStrictEqual(r.correction, { amount: 400 });
});
test('"nahi 6 kilo" changes only the quantity', function () {
  var r = Parser.parseConfirm('nahi 6 kilo', ITEMS);
  assert.deepStrictEqual(r.correction, { qty: 6, qtyUnit: 'kg' });
});
test('"haan kar do" is a plain yes (no amount 2)', function () {
  var r = Parser.parseConfirm('haan kar do', ITEMS);
  assert.strictEqual(r.answer, 'yes'); assert.strictEqual(r.correction, null);
});

section('Questions, undo, setup');
test('"Aaj ka munafa kitna hua?" -> profit query', function () {
  assert.strictEqual(Parser.parse('Aaj ka munafa kitna hua?', ITEMS).intent, 'query_profit');
});
test('"Biscuit ke kitne packet bache?" -> stock query for biscuit', function () {
  var r = Parser.parse('Biscuit ke kitne packet bache?', ITEMS);
  assert.strictEqual(r.intent, 'query_stock'); assert.strictEqual(r.itemId, 'biscuit');
});
test('"Pichhla hatao" -> undo', function () {
  assert.strictEqual(Parser.parse('Pichhla hatao', ITEMS).intent, 'undo');
  assert.strictEqual(Parser.parse('पिछला हटाओ', ITEMS).intent, 'undo');
});
test('"aaj ka hisaab" -> report', function () {
  assert.strictEqual(Parser.parse('aaj ka hisaab batao', ITEMS).intent, 'report');
});
test('gibberish -> unknown', function () {
  assert.strictEqual(Parser.parse('hello hello', ITEMS).intent, 'unknown');
});
test('matchTemplate picks the right fixed template', function () {
  assert.strictEqual(Parser.matchTemplate('meri kirana ki dukaan hai', Data.TEMPLATES), 'kirana');
  assert.strictEqual(Parser.matchTemplate('main sabzi ka thela lagata hoon', Data.TEMPLATES), 'sabzi');
  assert.strictEqual(Parser.matchTemplate('main darzi hoon blouse silai', Data.TEMPLATES), 'tailor');
  assert.strictEqual(Parser.matchTemplate('chai aur samosa ki tapri', Data.TEMPLATES), 'food');
  assert.strictEqual(Parser.matchTemplate('kuch nahi pata', Data.TEMPLATES), 'kirana');
});
test('parseUnitWord / mentionedItems', function () {
  assert.strictEqual(Parser.parseUnitWord('kilo mein'), 'kg');
  assert.strictEqual(Parser.parseUnitWord('packet'), 'packet');
  assert.deepStrictEqual(Parser.mentionedItems('chawal, dal aur tel', ITEMS), ['rice', 'dal', 'oil']);
});

section('Templates are valid and pre-tested');
Object.keys(Data.TEMPLATES).forEach(function (id) {
  var tpl = Data.TEMPLATES[id];
  test(id + ': items valid and sample parses', function () {
    var ids = {};
    tpl.items.forEach(function (it) {
      assert.ok(!ids[it.id], 'duplicate id ' + it.id); ids[it.id] = true;
      assert.ok(['kg', 'litre', 'packet', 'piece'].indexOf(it.unit) >= 0, 'bad unit ' + it.unit);
      assert.ok(it.buy > 0 && it.sell > it.buy, it.id + ' needs 0 < buy < sell');
      assert.ok(it.aliases.length >= 2, it.id + ' needs aliases');
    });
    var r = Parser.parse(tpl.sample.text, tpl.items);
    assert.strictEqual(r.intent, 'transaction');
    var c = r.cards[0];
    assert.deepStrictEqual([c.type, c.itemId, c.qty, c.amount],
      [tpl.sample.type, tpl.sample.itemId, tpl.sample.qty, tpl.sample.amount]);
  });
});
test('kirana template has 8 seeded grocery items', function () {
  assert.strictEqual(ITEMS.length, 8);
});

section('Money formatting');
test('Indian grouping', function () {
  assert.strictEqual(Calc.formatINR(300000), '₹3,00,000');
  assert.strictEqual(Calc.formatINR(1234567.5), '₹12,34,567.50');
  assert.strictEqual(Calc.formatINR(999), '₹999');
  assert.strictEqual(Calc.formatINR(-500), '-₹500');
  assert.strictEqual(Calc.formatINR(0.1 + 0.2), '₹0.30');
  assert.strictEqual(Calc.formatNumber(1.5), '1.5');
  assert.strictEqual(Calc.formatNumber(100000), '1,00,000');
});

section('Profit and stock calculations');
test('item profit allocates expenses by sales and preserves paise', function () {
  var input = [
    { type: 'sale', itemId: 'rice', qty: 1, amount: 100, unitCost: 40 },
    { type: 'sale', itemId: 'biscuit', qty: 1, amount: 200, unitCost: 8 },
    { type: 'expense', amount: 1 }
  ];
  assert.deepStrictEqual(Calc.itemProfits(input, ITEMS), [
    { itemId: 'rice', sales: 100, cost: 40, expenses: 0.33, profit: 59.67 },
    { itemId: 'biscuit', sales: 200, cost: 8, expenses: 0.67, profit: 191.33 }
  ]);
  assert.strictEqual(Calc.itemProfits([{ type: 'expense', amount: 10 }], ITEMS).length, 0);
});
test('item buying costs reconcile with total cost when fractional quantities need rounding', function () {
  var input = [
    { type: 'sale', itemId: 'rice', qty: 0.001, amount: 1, unitCost: 4 },
    { type: 'sale', itemId: 'biscuit', qty: 0.001, amount: 1, unitCost: 4 }
  ];
  var rows = Calc.itemProfits(input, ITEMS);
  assert.strictEqual(rows.reduce(function (sum, row) { return sum + row.cost; }, 0), Calc.costOfSales(input, ITEMS));
  assert.strictEqual(Calc.round2(rows.reduce(function (sum, row) { return sum + row.profit; }, 0)),
    Calc.profitSummary(input, ITEMS).profit);
});
test('stock corrections and later purchases and sales affect stock and can be undone', function () {
  var items = [{ id: 'x', opening: 10 }];
  var changes = [
    { type: 'sale', itemId: 'x', qty: 3 },
    { type: 'adjustment', itemId: 'x', qty: Calc.stockAdjustment(7, 4) },
    { type: 'purchase', itemId: 'x', qty: 5 }
  ];
  assert.strictEqual(Calc.stockLevels(items, changes).x, 9);
  assert.strictEqual(Calc.stockLevels(items, changes.slice(0, 1)).x, 7);
  assert.strictEqual(Calc.stockAdjustment(4, 10), 6);
});
var T = new Date(2026, 10, 27, 12, 0, 0).getTime();
var Y = new Date(2026, 10, 26, 12, 0, 0).getTime();
var entries = [
  { ts: T, type: 'sale', itemId: 'rice', qty: 5, amount: 300, unitCost: 40 },     // cost 200
  { ts: T, type: 'sale', itemId: 'biscuit', qty: 4, amount: 40 },                  // cost 4*8 = 32 (item price)
  { ts: T, type: 'expense', category: 'transport', amount: 100 },
  { ts: T, type: 'purchase', itemId: 'rice', qty: 20, amount: 800 },
  { ts: Y, type: 'sale', itemId: 'rice', qty: 2, amount: 120, unitCost: 40 }
];
test('profit = sales - cost of items sold - expenses (today)', function () {
  var s = Calc.profitSummary(Calc.entriesOn(entries, Calc.dayKey(T)), ITEMS);
  assert.deepStrictEqual(s, { sales: 340, cost: 232, expenses: 100, purchases: 800, profit: 8 });
});
test('purchases do not reduce profit directly', function () {
  var s = Calc.profitSummary([{ ts: T, type: 'purchase', itemId: 'rice', qty: 20, amount: 800 }], ITEMS);
  assert.strictEqual(s.profit, 0);
});
test('loss is negative', function () {
  var s = Calc.profitSummary([{ ts: T, type: 'expense', amount: 250 }], ITEMS);
  assert.strictEqual(s.profit, -250);
});
test('stock = opening + purchases - sales', function () {
  var lv = Calc.stockLevels(ITEMS, entries);
  assert.strictEqual(lv.rice, 50 + 20 - 5 - 2);
  assert.strictEqual(lv.biscuit, 40 - 4);
  assert.strictEqual(lv.milk, 20);
});
test('undo (removing an entry) restores stock', function () {
  var lv = Calc.stockLevels(ITEMS, entries.slice(0, -1));
  assert.strictEqual(lv.rice, 50 + 20 - 5);
});
test('service items are not stocked', function () {
  var lv = Calc.stockLevels(Data.TEMPLATES.tailor.items, [{ ts: T, type: 'sale', itemId: 'blouse', qty: 2, amount: 500 }]);
  assert.ok(!('blouse' in lv)); assert.strictEqual(lv.thread, 40);
});
test('low stock detection', function () {
  var low = Calc.lowStockItems(ITEMS, [{ ts: T, type: 'sale', itemId: 'dal', qty: 18, amount: 2520 }]);
  assert.deepStrictEqual(low.map(function (i) { return i.id; }), ['dal']);
});
test('daily history covers N days, newest first', function () {
  var h = Calc.dailyHistory(entries, ITEMS, T, 3);
  assert.strictEqual(h.length, 3);
  assert.strictEqual(h[0].key, Calc.dayKey(T)); assert.strictEqual(h[1].sales, 120);
});
test('expectedAmount uses sell / buy rate', function () {
  assert.strictEqual(Calc.expectedAmount(item('rice'), 5, 'sale'), 300);
  assert.strictEqual(Calc.expectedAmount(item('rice'), 5, 'purchase'), 200);
});
test('seed data computes without errors', function () {
  var db = Data.freshDb('kirana', T, true);
  assert.ok(db.entries.length >= 8);
  var s = Calc.profitSummary(Calc.entriesOn(db.entries, Calc.dayKey(T)), db.items);
  assert.strictEqual(s.profit, Calc.round2(s.sales - s.cost - s.expenses));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
