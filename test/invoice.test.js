'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function makeHsnOrder() {
  const items = [{
    id: 1,
    sku: 'RICE-001',
    name: 'Rice',
    hsn: '1006',
    price: 1000,
    qty: 1
  }];
  const totals = pricing.computeTotals(items, 'SAVE10');

  return {
    id: 1001,
    date: '22/11/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items,
    coupon: 'SAVE10',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('CURRENT BEHAVIOUR: order pricing applies the HSN slab after coupon discount', function () {
  const order = makeHsnOrder();
  const billed = pricing.computeTotals(order.items, order.coupon);

  assert.equal(billed.subtotal, 1000);
  assert.equal(billed.discount, 100);
  assert.equal(billed.lines[0].gstPercent, 5);
  assert.equal(billed.tax, 45);
  assert.equal(billed.total, 945);
});

test('invoice figures match HSN GST and discounted tax used for the billed order', function () {
  const order = makeHsnOrder();
  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[0].lineTax, 45);
  assert.equal(order.discount, 100);
  assert.equal(figures.discount, 100);
  assert.equal(figures.tax, 45);
  assert.equal(figures.cgst, 22.5);
  assert.equal(figures.sgst, 22.5);
  assert.equal(figures.total, 945);
});

test('invoice applies the same coupon maximum discount as order pricing', function () {
  const items = [{
    id: 2,
    sku: 'TEA-001',
    name: 'Packaged tea',
    hsn: '0902',
    price: 2000,
    qty: 1
  }];
  const billed = pricing.computeTotals(items, 'SAVE10');
  const figures = invoice.computeInvoiceFigures({ items, coupon: 'SAVE10' });

  assert.equal(billed.discount, 150);
  assert.equal(billed.tax, 333);
  assert.equal(billed.total, 2183);
  assert.equal(figures.rows[0].gstPercent, 18);
  assert.equal(figures.tax, 333);
  assert.equal(figures.discount, 150);
  assert.equal(figures.total, 2183);
});

test('invoice total and GST match the amount billed by order pricing', function () {
  const order = makeHsnOrder();
  const billed = pricing.computeTotals(order.items, order.coupon);
  const figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual({
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total,
    gstPercent: figures.rows[0].gstPercent,
    lineTax: figures.rows[0].lineTax
  }, {
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    cgst: billed.cgst,
    sgst: billed.sgst,
    total: billed.total,
    gstPercent: billed.lines[0].gstPercent,
    lineTax: billed.lines[0].tax
  });
});

test('reconciliation reports matching invoice and ledger totals', function () {
  const order = makeHsnOrder();
  const result = reports.getGstReconciliation({ orders: [order] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.rows[0].ledgerTax, 45);
  assert.equal(result.rows[0].invoiceTax, 45);
  assert.equal(result.rows[0].ledgerTotal, 945);
  assert.equal(result.rows[0].invoiceTotal, 945);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
});
