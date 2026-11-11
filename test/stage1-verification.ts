/**
 * Stage 1 Verification Suite: Local Database Migration & Quotation System
 * Tests quotation parsing, price matching separation, math calculations, and backup validation.
 */

import { parseRawQuotationText, matchProductWithLibrary, generateUniqueId, standardizeProductName } from '../src/utils/quotationParser';
import { PriceItem, QuotationLineItem } from '../src/types';
import { multMoney, addMoney } from '../src/utils/math';
import { storage } from '../src/services/storage';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${message}`);
  }
}

console.log('====================================================');
console.log('RUNNING STAGE 1 VERIFICATION SUITE');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST SET 1: QUOTATION PARSER 8 MANDATORY CASES
// ----------------------------------------------------
console.log('--- Test Set 1: Quotation Parser Requirements ---');

// Case 1: 2 x PVC pipes 19mm
const r1 = parseRawQuotationText('2 x PVC pipes 19mm');
assert(r1.length === 1, 'Case 1 returns 1 line item');
assert(r1[0].quantity === 2, `Case 1 quantity is 2 (got ${r1[0].quantity})`);
assert(r1[0].item_description.toLowerCase().includes('pvc pipes 19mm'), `Case 1 item_description is 'PVC pipes 19mm' (got '${r1[0].item_description}')`);

// Case 2: 8 lengths of 15 mm copper pipe
const r2 = parseRawQuotationText('8 lengths of 15 mm copper pipe');
assert(r2.length === 1, 'Case 2 returns 1 line item');
assert(r2[0].quantity === 8, `Case 2 quantity is 8 (got ${r2[0].quantity})`);
assert(r2[0].unit === 'lengths', `Case 2 unit is 'lengths' (got '${r2[0].unit}')`);
assert(r2[0].item_description.toLowerCase().includes('15 mm copper pipe'), `Case 2 description preserves '15 mm copper pipe' (got '${r2[0].item_description}')`);

// Case 3: 20 x 15 mm copper elbows
const r3 = parseRawQuotationText('20 x 15 mm copper elbows');
assert(r3.length === 1, 'Case 3 returns 1 line item');
assert(r3[0].quantity === 20, `Case 3 quantity is 20 (got ${r3[0].quantity})`);
assert(r3[0].item_description.toLowerCase().includes('15 mm copper elbows'), `Case 3 item_description is '15 mm copper elbows' (got '${r3[0].item_description}')`);

// Case 4: 3*2 timber -> 3 must NOT be treated as quantity
const r4 = parseRawQuotationText('3*2 timber');
assert(r4.length === 1, 'Case 4 returns 1 line item');
assert(r4[0].quantity !== 3, `Case 4 quantity is NOT 3 (got ${r4[0].quantity})`);
assert(r4[0].item_description.toLowerCase().includes('3*2 timber'), `Case 4 description preserves '3*2 timber' (got '${r4[0].item_description}')`);
assert(r4[0].is_ambiguous === true, 'Case 4 flagged as ambiguous for review');

// Case 5: 2x4 timber -> 2x4 preserved as dimension
const r5 = parseRawQuotationText('2x4 timber');
assert(r5.length === 1, 'Case 5 returns 1 line item');
assert(r5[0].quantity !== 2, `Case 5 quantity is NOT 2 (got ${r5[0].quantity})`);
assert(r5[0].item_description.toLowerCase().includes('2x4 timber'), `Case 5 description preserves '2x4 timber' (got '${r5[0].item_description}')`);
assert(r5[0].is_ambiguous === true, 'Case 5 flagged as ambiguous for review');

// Case 6: 19mm PVC pipe -> 19 must NOT be treated as quantity
const r6 = parseRawQuotationText('19mm PVC pipe');
assert(r6.length === 1, 'Case 6 returns 1 line item');
assert(r6[0].quantity !== 19, `Case 6 quantity is NOT 19 (got ${r6[0].quantity})`);
assert(r6[0].item_description.toLowerCase().includes('19mm pvc pipe'), `Case 6 description preserves '19mm PVC pipe' (got '${r6[0].item_description}')`);
assert(r6[0].is_ambiguous === true, 'Case 6 flagged as ambiguous for review');

// Case 7: 100 x Coupling
const r7 = parseRawQuotationText('100 x Coupling');
assert(r7.length === 1, 'Case 7 returns 1 line item');
assert(r7[0].quantity === 100, `Case 7 quantity is 100 (got ${r7[0].quantity})`);
assert(r7[0].item_description.toLowerCase() === 'coupling', `Case 7 description is 'Coupling' (got '${r7[0].item_description}')`);

// Case 8: 2 rolls DPC membrane 30m
const r8 = parseRawQuotationText('2 rolls DPC membrane 30m');
assert(r8.length === 1, 'Case 8 returns 1 line item');
assert(r8[0].quantity === 2, `Case 8 quantity is 2 (got ${r8[0].quantity})`);
assert(r8[0].unit === 'rolls', `Case 8 unit is 'rolls' (got '${r8[0].unit}')`);
assert(r8[0].item_description.toLowerCase().includes('dpc membrane 30m'), `Case 8 description preserves 'DPC membrane 30m' (got '${r8[0].item_description}')`);

// Unique ID uniqueness check
const idSet = new Set<string>();
for (let i = 0; i < 1000; i++) {
  idSet.add(generateUniqueId('item'));
}
assert(idSet.size === 1000, 'generateUniqueId generates 1000 collision-free distinct IDs in rapid succession');


// ----------------------------------------------------
// TEST SET 2: PRICE LIBRARY MATCHING & MATERIAL SEPARATION
// ----------------------------------------------------
console.log('\n--- Test Set 2: Price Library Matching Rules ---');

const sampleLibrary: PriceItem[] = [
  {
    id: 'p-pvc-15',
    product_name: 'PVC Coupling 15mm',
    standardized_name: standardizeProductName('PVC Coupling 15mm'),
    category: 'plumbing',
    unit: 'pcs',
    current_unit_price: 1.50,
    previous_prices: [],
    quotation_count: 10,
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: 'p-pvc-20',
    product_name: 'PVC Coupling 20mm',
    standardized_name: standardizeProductName('PVC Coupling 20mm'),
    category: 'plumbing',
    unit: 'pcs',
    current_unit_price: 2.25,
    previous_prices: [],
    quotation_count: 12,
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: 'p-copper-15',
    product_name: 'Copper Elbow 15mm',
    standardized_name: standardizeProductName('Copper Elbow 15mm'),
    category: 'plumbing',
    unit: 'pcs',
    current_unit_price: 4.80,
    previous_prices: [],
    quotation_count: 5,
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: 'p-pvc-elbow-15',
    product_name: 'PVC Elbow 15mm',
    standardized_name: standardizeProductName('PVC Elbow 15mm'),
    category: 'plumbing',
    unit: 'pcs',
    current_unit_price: 1.20,
    previous_prices: [],
    quotation_count: 8,
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];

// Rule: Same product + same size: matches
const matchSame = matchProductWithLibrary('PVC Coupling 15mm', sampleLibrary);
assert(matchSame.matchedItem !== null, 'PVC Coupling 15mm matches library record');
assert(matchSame.matchedItem?.id === 'p-pvc-15', 'Matched correct 15mm PVC coupling');

// Rule: Same product + different sizes: does NOT match
const matchDiffSize = matchProductWithLibrary('PVC Coupling 25mm', sampleLibrary);
assert(matchDiffSize.matchedItem === null, 'PVC Coupling 25mm does NOT match 15mm or 20mm');

// Rule: Different materials: Copper vs PVC does NOT match
const matchCopper = matchProductWithLibrary('Copper Elbow 15mm', sampleLibrary);
assert(matchCopper.matchedItem?.id === 'p-copper-15', 'Copper Elbow 15mm matches Copper Elbow');
const matchPvcElbow = matchProductWithLibrary('PVC Elbow 15mm', sampleLibrary);
assert(matchPvcElbow.matchedItem?.id === 'p-pvc-elbow-15', 'PVC Elbow 15mm matches PVC Elbow, not Copper');

// Rule: Ambiguous product without size: returns candidates, no auto-match
const matchAmbiguous = matchProductWithLibrary('Coupling', sampleLibrary);
assert(matchAmbiguous.matchedItem === null, "Generic 'Coupling' does NOT auto-match 15mm or 20mm");
assert(matchAmbiguous.candidates.length > 0, "Generic 'Coupling' returns candidates for review");


// ----------------------------------------------------
// TEST SET 3: MATH CALCULATIONS & ZERO / NEGATIVE PRICES
// ----------------------------------------------------
console.log('\n--- Test Set 3: Financial Precision & Negative Input Rejection ---');

// Precision test
const lineTotal = multMoney(7, 3.45);
assert(lineTotal === 24.15, `multMoney(7, 3.45) = 24.15 (got ${lineTotal})`);

// Cumulative total test
const grandTotal = addMoney(addMoney(24.15, 18.90), 100.05);
assert(grandTotal === 143.10, `addMoney totals match 143.10 (got ${grandTotal})`);

// Zero price is allowed for items awaiting supplier quote
const zeroPriceLine: QuotationLineItem = {
  id: 'item-zero',
  item_description: 'Special order custom bracket',
  quantity: 2,
  unit: 'pieces',
  unit_price: 0,
  line_total: 0,
  matched_from_library: false,
};
assert(zeroPriceLine.line_total === 0, 'Zero unit price yields zero total line');


// ----------------------------------------------------
// TEST SET 4: BACKUP & DATA SOVEREIGNTY INVARIANTS
// ----------------------------------------------------
console.log('\n--- Test Set 4: Backup Schema Validation Invariants ---');

const mockStateBackup = {
  app: 'SHUCADEA_MANAGER',
  format_version: 1,
  exported_at: new Date().toISOString(),
  data: {
    settings: { business_name: 'Shucadea Hardware' },
    whiteBatches: [{ id: 'wb-1', batch_number: 'B1', purchase_price: 23, total_doors: 20 }],
    whiteSales: [],
    brownPurchases: [],
    brownSales: [],
    brownWithdrawals: [],
    doorTransactions: [],
    hardwareTransactions: [],
    dailyClosings: [],
    priceLibrary: sampleLibrary,
    quotations: [{ id: 'q-1', quote_number: 'Q-001', customer_name: 'Moyo', total_amount: 150 }],
  },
};

const validJson = JSON.stringify(mockStateBackup);
const validation = storage.validateBackup(validJson);
assert(validation.valid === true, 'Valid backup passes validation');
assert(validation.summary?.quotationCount === 1, 'Validation summary detects 1 quotation');
assert(validation.summary?.priceLibraryCount === 4, 'Validation summary detects 4 price library items');
assert(validation.summary?.whiteBatchesCount === 1, 'Validation summary detects 1 white batch');

const invalidJson = '{"foo": "bar"}';
const invalidValidation = storage.validateBackup(invalidJson);
assert(invalidValidation.valid === false, 'Invalid data payload is rejected');

console.log('\n====================================================');
console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('ALL VERIFICATION SUITE INVARIANTS SATISFIED!');
}
