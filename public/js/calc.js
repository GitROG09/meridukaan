/*
 * MeriDukaan - calc.js
 * Fixed, pure, deterministic functions for every total shown or spoken in the app.
 * No DOM access, no storage, no randomness, no AI. Same input -> same output.
 * Works in the browser (window.Calc) and in Node (module.exports) for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EXPENSE_LIMIT = 50000;      // a single shop expense above this is suspicious
  var QTY_LIMIT = 10000;          // nobody sells 10,000+ kg in one entry at a kirana
  var PRICE_RATIO_HIGH = 5;       // unit price > 5x usual price -> suspicious
  var PRICE_RATIO_LOW = 0.2;      // unit price < 1/5 of usual price -> suspicious

  function toNum(n) {
    n = Number(n);
    return isFinite(n) ? n : 0;
  }

  function round2(n) {
    return Math.round(toNum(n) * 100) / 100;
  }

  function round3(n) {
    return Math.round(toNum(n) * 1000) / 1000;
  }

  // "1234567" -> "12,34,567" (Indian lakh/crore grouping)
  function groupIndian(intStr) {
    if (intStr.length <= 3) return intStr;
    var last3 = intStr.slice(-3);
    var rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }

  function formatINR(n) {
    var v = round2(n);
    var abs = Math.abs(v);
    var intPart = Math.floor(abs);
    var frac = Math.round((abs - intPart) * 100);
    var s = '₹' + groupIndian(String(intPart));
    if (frac) s += '.' + (frac < 10 ? '0' : '') + frac;
    return (v < 0 ? '-' : '') + s;
  }

  // Quantity / plain number with Indian grouping, up to 3 decimals, no trailing zeros.
  function formatNumber(n) {
    var v = round3(n);
    var abs = Math.abs(v);
    var intPart = Math.floor(abs);
    var fracStr = String(round3(abs - intPart)).replace(/^0/, '');
    if (fracStr === '0') fracStr = '';
    return (v < 0 ? '-' : '') + groupIndian(String(intPart)) + fracStr;
  }

  // Local-time calendar day key, e.g. "2026-11-27"
  function dayKey(ts) {
    var d = new Date(ts);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function entriesOn(entries, key) {
    return (entries || []).filter(function (e) { return dayKey(e.ts) === key; });
  }

  function sumAmount(entries, type) {
    var total = 0;
    (entries || []).forEach(function (e) {
      if (e.type === type) total += toNum(e.amount);
    });
    return round2(total);
  }

  function totalSales(entries) { return sumAmount(entries, 'sale'); }
  function totalExpenses(entries) { return sumAmount(entries, 'expense'); }
  function totalPurchases(entries) { return sumAmount(entries, 'purchase'); }

  function indexItems(items) {
    var map = {};
    (items || []).forEach(function (it) { map[it.id] = it; });
    return map;
  }

  // Buying cost of the goods that were sold. Uses the unit cost captured at sale time
  // (entry.unitCost) so later price changes never rewrite history.
  function costOfSales(entries, items) {
    var byId = indexItems(items);
    var total = 0;
    (entries || []).forEach(function (e) {
      if (e.type !== 'sale') return;
      var item = byId[e.itemId];
      var unitCost = e.unitCost != null ? toNum(e.unitCost) : (item ? toNum(item.buy) : 0);
      total += toNum(e.qty) * unitCost;
    });
    return round2(total);
  }

  // Profit = sales - buying cost of items sold - expenses.
  // Stock purchases are NOT subtracted directly: their cost reaches profit only when sold.
  function profitSummary(entries, items) {
    var sales = totalSales(entries);
    var cost = costOfSales(entries, items);
    var expenses = totalExpenses(entries);
    return {
      sales: sales,
      cost: cost,
      expenses: expenses,
      purchases: totalPurchases(entries),
      profit: round2(sales - cost - expenses)
    };
  }

  // Current stock = opening stock + purchased qty - sold qty. Service items are not stocked.
  function stockLevels(items, entries) {
    var levels = {};
    (items || []).forEach(function (it) {
      if (!it.service) levels[it.id] = toNum(it.opening);
    });
    (entries || []).forEach(function (e) {
      if (!Object.prototype.hasOwnProperty.call(levels, e.itemId)) return;
      if (e.type === 'purchase') levels[e.itemId] += toNum(e.qty);
      else if (e.type === 'sale') levels[e.itemId] -= toNum(e.qty);
    });
    Object.keys(levels).forEach(function (k) { levels[k] = round3(levels[k]); });
    return levels;
  }

  function isLowStock(item, qty) {
    if (!item || item.service) return false;
    var limit = item.low != null ? toNum(item.low) : 5;
    return toNum(qty) <= limit;
  }

  function lowStockItems(items, entries) {
    var levels = stockLevels(items, entries);
    return (items || []).filter(function (it) {
      return !it.service && isLowStock(it, levels[it.id]);
    });
  }

  // Price you would expect for a quantity, from the item's rate card.
  function expectedAmount(item, qty, type) {
    if (!item) return 0;
    var rate = type === 'purchase' ? toNum(item.buy) : toNum(item.sell);
    return round2(rate * toNum(qty));
  }

  // Sanity check for a draft card before confirmation.
  // Returns { ok: true } or { ok: false, field: 'amount'|'qty', reason: '...' }.
  function checkPlausible(card, item) {
    if (!card) return { ok: false, field: 'amount', reason: 'missing' };
    var amount = toNum(card.amount);
    if (amount <= 0) return { ok: false, field: 'amount', reason: 'amount_nonpositive' };
    if (card.type === 'expense') {
      if (amount > EXPENSE_LIMIT) return { ok: false, field: 'amount', reason: 'amount_high' };
      return { ok: true };
    }
    var qty = toNum(card.qty);
    if (qty <= 0) return { ok: false, field: 'qty', reason: 'qty_nonpositive' };
    if (qty > QTY_LIMIT) return { ok: false, field: 'qty', reason: 'qty_high' };
    var ref = item ? toNum(card.type === 'purchase' ? item.buy : item.sell) : 0;
    if (ref > 0) {
      var ratio = (amount / qty) / ref;
      if (ratio > PRICE_RATIO_HIGH) return { ok: false, field: 'amount', reason: 'amount_high' };
      if (ratio < PRICE_RATIO_LOW) return { ok: false, field: 'amount', reason: 'amount_low' };
    }
    return { ok: true };
  }

  // Per-day profit summaries for the last `days` days ending at endTs (newest first).
  function dailyHistory(entries, items, endTs, days) {
    var out = [];
    var d = new Date(endTs);
    d.setHours(12, 0, 0, 0); // midday avoids DST edge cases when stepping back
    for (var i = 0; i < days; i++) {
      var key = dayKey(d.getTime());
      var s = profitSummary(entriesOn(entries, key), items);
      s.key = key;
      out.push(s);
      d.setDate(d.getDate() - 1);
    }
    return out;
  }

  return {
    round2: round2,
    round3: round3,
    formatINR: formatINR,
    formatNumber: formatNumber,
    dayKey: dayKey,
    entriesOn: entriesOn,
    totalSales: totalSales,
    totalExpenses: totalExpenses,
    totalPurchases: totalPurchases,
    costOfSales: costOfSales,
    profitSummary: profitSummary,
    stockLevels: stockLevels,
    isLowStock: isLowStock,
    lowStockItems: lowStockItems,
    expectedAmount: expectedAmount,
    checkPlausible: checkPlausible,
    dailyHistory: dailyHistory,
    EXPENSE_LIMIT: EXPENSE_LIMIT
  };
});
