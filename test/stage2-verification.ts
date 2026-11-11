/**
 * Stage 2 Verification Suite: Structured Quotation Import & Price Learning
 * Tests all 11 required test cases.
 */

import {
  parseStructuredQuotationText,
  preparePriceLibraryImport,
  parseRawQuotationText,
  standardizeProductName,
} from '../src/utils/quotationParser';
import { PriceItem } from '../src/types';

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
console.log('RUNNING STAGE 2 VERIFICATION SUITE');
console.log('====================================================\n');

// Sample Price Library for Tests
const sampleLibrary: PriceItem[] = [
  {
    id: 'pl-bath',
    product_name: 'Bathtub',
    standardized_name: standardizeProductName('Bathtub'),
    category: 'plumbing',
    unit: 'pcs',
    current_unit_price: 80.00, // existing catalog price is 80.00
    previous_prices: [],
    quotation_count: 5,
    last_updated: '2025-01-01',
    created_at: '2025-01-01',
  },
  {
    id: 'pl-pvc-15',
    product_name: 'PVC Elbow 15mm',
    standardized_name: standardizeProductName('PVC Elbow 15mm'),
    category: 'plumbing',
    unit: 'pcs',
    current_unit_price: 1.50,
    previous_prices: [],
    quotation_count: 10,
    last_updated: '2025-01-01',
    created_at: '2025-01-01',
  },
  {
    id: 'pl-pvc-20',
    product_name: 'PVC Elbow 20mm',
    standardized_name: standardizeProductName('PVC Elbow 20mm'),
    category: 'plumbing',
    unit: 'pcs',
    current_unit_price: 2.25,
    previous_prices: [],
    quotation_count: 10,
    last_updated: '2025-01-01',
    created_at: '2025-01-01',
  },
];

// -------------------------------------------------------------------
// TEST 1 — Tab-separated:
// Item    Quantity    Unit Price    Total Price
// Bathtub    2    100.00    200.00
// Basin Mixer    3    25.00    75.00
// -------------------------------------------------------------------
console.log('--- Test 1: Tab-Separated Input ---');
const t1Text = `Item\tQuantity\tUnit Price\tTotal Price
Bathtub\t2\t100.00\t200.00
Basin Mixer\t3\t25.00\t75.00`;

const res1 = parseStructuredQuotationText(t1Text, sampleLibrary);
assert(res1.validRows.length === 2, `Test 1 extracts 2 valid rows (got ${res1.validRows.length})`);
assert(res1.validRows[0].item_description === 'Bathtub', `Test 1 row 0 description is Bathtub (got '${res1.validRows[0]?.item_description}')`);
assert(res1.validRows[0].quantity === 2, `Test 1 row 0 quantity is 2 (got ${res1.validRows[0]?.quantity})`);
assert(res1.validRows[0].unit_price === 100, `Test 1 row 0 unit price is 100.00 (got ${res1.validRows[0]?.unit_price})`);
assert(res1.validRows[0].supplied_total === 200, `Test 1 row 0 supplied total is 200.00 (got ${res1.validRows[0]?.supplied_total})`);
assert(res1.validRows[1].item_description === 'Basin Mixer', `Test 1 row 1 description is Basin Mixer (got '${res1.validRows[1]?.item_description}')`);
assert(res1.validRows[1].quantity === 3, `Test 1 row 1 quantity is 3 (got ${res1.validRows[1]?.quantity})`);
assert(res1.validRows[1].unit_price === 25, `Test 1 row 1 unit price is 25.00 (got ${res1.validRows[1]?.unit_price})`);
assert(res1.validRows[1].supplied_total === 75, `Test 1 row 1 supplied total is 75.00 (got ${res1.validRows[1]?.supplied_total})`);

// -------------------------------------------------------------------
// TEST 2 — Pipe-separated:
// Description | Qty | Rate | Amount
// PVC Pipe 20mm | 10 | 4.50 | 45.00
// -------------------------------------------------------------------
console.log('\n--- Test 2: Pipe-Separated Input ---');
const t2Text = `Description | Qty | Rate | Amount
PVC Pipe 20mm | 10 | 4.50 | 45.00`;

const res2 = parseStructuredQuotationText(t2Text, sampleLibrary);
assert(res2.validRows.length === 1, `Test 2 extracts 1 valid row (got ${res2.validRows.length})`);
assert(res2.validRows[0].item_description === 'PVC Pipe 20mm', `Test 2 description is 'PVC Pipe 20mm' (got '${res2.validRows[0]?.item_description}')`);
assert(res2.validRows[0].quantity === 10, `Test 2 quantity is 10 (got ${res2.validRows[0]?.quantity})`);
assert(res2.validRows[0].unit_price === 4.5, `Test 2 unit price is 4.50 (got ${res2.validRows[0]?.unit_price})`);
assert(res2.validRows[0].supplied_total === 45, `Test 2 supplied total is 45.00 (got ${res2.validRows[0]?.supplied_total})`);

// -------------------------------------------------------------------
// TEST 3 — Different column order:
// Qty    Description    Amount    Unit Price
// 2    Bathtub    200.00    100.00
// -------------------------------------------------------------------
console.log('\n--- Test 3: Different Column Order ---');
const t3Text = `Qty\tDescription\tAmount\tUnit Price
2\tBathtub\t200.00\t100.00`;

const res3 = parseStructuredQuotationText(t3Text, sampleLibrary);
assert(res3.validRows.length === 1, `Test 3 extracts 1 valid row (got ${res3.validRows.length})`);
assert(res3.validRows[0].item_description === 'Bathtub', `Test 3 description is Bathtub (got '${res3.validRows[0]?.item_description}')`);
assert(res3.validRows[0].quantity === 2, `Test 3 quantity is 2 (got ${res3.validRows[0]?.quantity})`);
assert(res3.validRows[0].unit_price === 100, `Test 3 unit price is 100.00 (got ${res3.validRows[0]?.unit_price})`);
assert(res3.validRows[0].supplied_total === 200, `Test 3 total is 200.00 (got ${res3.validRows[0]?.supplied_total})`);

// -------------------------------------------------------------------
// TEST 4 — Currency and thousands separators:
// Item,Qty,Unit Price,Total
// Water Tank,2,“1,200.00”,“2,400.00”
// -------------------------------------------------------------------
console.log('\n--- Test 4: Currency and Thousands Separators ---');
const t4Text = `Item,Qty,Unit Price,Total
Water Tank,2,“1,200.00”,“2,400.00”`;

const res4 = parseStructuredQuotationText(t4Text, sampleLibrary);
assert(res4.validRows.length === 1, `Test 4 extracts 1 valid row (got ${res4.validRows.length})`);
assert(res4.validRows[0].item_description === 'Water Tank', `Test 4 description is Water Tank (got '${res4.validRows[0]?.item_description}')`);
assert(res4.validRows[0].quantity === 2, `Test 4 quantity is 2 (got ${res4.validRows[0]?.quantity})`);
assert(res4.validRows[0].unit_price === 1200, `Test 4 unit price is 1200.00 (got ${res4.validRows[0]?.unit_price})`);
assert(res4.validRows[0].supplied_total === 2400, `Test 4 supplied total is 2400.00 (got ${res4.validRows[0]?.supplied_total})`);

// -------------------------------------------------------------------
// TEST 5 — Summary rows:
// Item | Qty | Rate | Amount
// Bathtub | 2 | 100 | 200
// Subtotal | | | 200
// Grand Total | | | 200
// Only Bathtub should become a product.
// -------------------------------------------------------------------
console.log('\n--- Test 5: Summary Rows Exclusion ---');
const t5Text = `Item | Qty | Rate | Amount
Bathtub | 2 | 100 | 200
Subtotal | | | 200
Grand Total | | | 200`;

const res5 = parseStructuredQuotationText(t5Text, sampleLibrary);
assert(res5.validRows.length === 1, `Test 5 extracts exactly 1 product row (got ${res5.validRows.length})`);
assert(res5.validRows[0].item_description === 'Bathtub', `Test 5 product is Bathtub (got '${res5.validRows[0]?.item_description}')`);
assert(res5.summaryRows.length >= 2, `Test 5 recognized summary rows separately (got ${res5.summaryRows.length})`);

// -------------------------------------------------------------------
// TEST 6 — Invalid or missing quantity:
// -------------------------------------------------------------------
console.log('\n--- Test 6: Invalid or Missing Quantity ---');
const t6Text = `Item | Quantity | Unit Price | Total Price
Bathtub | ABC | 100.00 | 200.00
Sink | | 50.00 | 50.00`;

const res6 = parseStructuredQuotationText(t6Text, sampleLibrary);
assert(res6.validRows.length === 0, `Test 6 has 0 valid rows (got ${res6.validRows.length})`);
assert(res6.unrecognizedRows.length === 2, `Test 6 flags both rows with invalid/missing quantity (got ${res6.unrecognizedRows.length})`);
assert(res6.unrecognizedRows[0].status === 'invalid_numeric', `Test 6 row 0 status is 'invalid_numeric' (got '${res6.unrecognizedRows[0].status}')`);

// -------------------------------------------------------------------
// TEST 7 — Incorrect line total that does not equal quantity × unit price:
// -------------------------------------------------------------------
console.log('\n--- Test 7: Arithmetic Discrepancy Detection ---');
const t7Text = `Item | Quantity | Unit Price | Total Price
Bathtub | 2 | 100.00 | 350.00`;

const res7 = parseStructuredQuotationText(t7Text, sampleLibrary);
assert(res7.discrepancyRows.length === 1, `Test 7 flags arithmetic discrepancy row (got ${res7.discrepancyRows.length})`);
assert(res7.discrepancyRows[0].has_discrepancy === true, 'Test 7 has_discrepancy is true');
assert(res7.discrepancyRows[0].supplied_total === 350, `Test 7 preserves supplied total $350 (got ${res7.discrepancyRows[0].supplied_total})`);
assert(res7.discrepancyRows[0].calculated_total === 200, `Test 7 calculated total is $200 (got ${res7.discrepancyRows[0].calculated_total})`);

// -------------------------------------------------------------------
// TEST 8 — Existing product with a different catalog price:
// -------------------------------------------------------------------
console.log('\n--- Test 8: Price Learning Existing Product Price Change ---');
const t8Rows = res1.validRows; // Bathtub @ $100.00 (catalog has Bathtub @ $80.00)
const proposals8 = preparePriceLibraryImport(t8Rows, sampleLibrary);
const bathProposal = proposals8.find((p) => p.item_description.toLowerCase() === 'bathtub');
assert(bathProposal !== undefined, 'Bathtub proposal found');
assert(bathProposal?.status === 'update', `Bathtub status is 'update' (got '${bathProposal?.status}')`);
assert(bathProposal?.proposed_unit_price === 100, `Proposed price is 100 (got ${bathProposal?.proposed_unit_price})`);
assert(bathProposal?.existing_item?.current_unit_price === 80, `Existing catalog price was 80 (got ${bathProposal?.existing_item?.current_unit_price})`);

// -------------------------------------------------------------------
// TEST 9 — Ambiguous product match:
// -------------------------------------------------------------------
console.log('\n--- Test 9: Ambiguous Product Match in Price Learning ---');
const t9Text = `Item | Quantity | Unit Price | Total Price
Elbow | 10 | 2.00 | 20.00`;
const res9 = parseStructuredQuotationText(t9Text, sampleLibrary);
const proposals9 = preparePriceLibraryImport(res9.validRows, sampleLibrary);
const elbowProp = proposals9.find((p) => p.item_description === 'Elbow');
assert(elbowProp !== undefined, 'Elbow proposal found');
assert(elbowProp?.status === 'ambiguous', `Elbow status is 'ambiguous' due to 15mm vs 20mm (got '${elbowProp?.status}')`);
assert(elbowProp?.selected === false, 'Ambiguous proposal is unselected by default');

// -------------------------------------------------------------------
// TEST 10 — Repeated product with conflicting imported prices:
// -------------------------------------------------------------------
console.log('\n--- Test 10: Repeated Product with Conflicting Imported Prices ---');
const t10Text = `Item | Quantity | Unit Price | Total Price
Bathtub | 1 | 100.00 | 100.00
Bathtub | 1 | 150.00 | 150.00`;
const res10 = parseStructuredQuotationText(t10Text, sampleLibrary);
const proposals10 = preparePriceLibraryImport(res10.validRows, sampleLibrary);
assert(proposals10.length === 1, `Test 10 deduplicates to 1 product proposal (got ${proposals10.length})`);
assert(proposals10[0].is_conflict === true, 'Test 10 marks is_conflict = true');
assert(proposals10[0].status === 'conflict', `Test 10 status is 'conflict' (got '${proposals10[0].status}')`);
assert(proposals10[0].conflict_prices?.length === 2, `Test 10 recorded 2 conflicting prices (got ${proposals10[0].conflict_prices?.length})`);
assert(proposals10[0].selected === false, 'Conflict proposal is unselected for manual review');

// -------------------------------------------------------------------
// TEST 11 — Original raw-description parsing still works exactly as before:
// -------------------------------------------------------------------
console.log('\n--- Test 11: Original Raw-Description Parsing Invariants ---');
const raw11 = `2 x PVC pipes 19mm
8 lengths of 15 mm copper pipe
20 x 15 mm copper elbows
3*2 timber
2x4 timber
19mm PVC pipe
100 x Coupling
2 rolls DPC membrane 30m`;

const res11 = parseRawQuotationText(raw11, sampleLibrary);
assert(res11.length === 8, `Test 11 parsed 8 raw items (got ${res11.length})`);
assert(res11[0].quantity === 2 && res11[0].item_description.includes('PVC pipes 19mm'), 'Case 1 preserved: 2 x PVC pipes 19mm');
assert(res11[1].quantity === 8 && res11[1].unit === 'lengths' && res11[1].item_description.includes('15 mm copper pipe'), 'Case 2 preserved: 8 lengths of 15 mm copper pipe');
assert(res11[2].quantity === 20 && res11[2].item_description.includes('15 mm copper elbows'), 'Case 3 preserved: 20 x 15 mm copper elbows');
assert(res11[3].quantity !== 3 && res11[3].item_description.includes('3*2 timber') && res11[3].is_ambiguous === true, 'Case 4 preserved: 3*2 timber (dim not qty)');
assert(res11[4].quantity !== 2 && res11[4].item_description.includes('2x4 timber') && res11[4].is_ambiguous === true, 'Case 5 preserved: 2x4 timber (dim not qty)');
assert(res11[5].quantity !== 19 && res11[5].item_description.includes('19mm PVC pipe') && res11[5].is_ambiguous === true, 'Case 6 preserved: 19mm PVC pipe (spec not qty)');
assert(res11[6].quantity === 100 && res11[6].item_description === 'Coupling', 'Case 7 preserved: 100 x Coupling');
assert(res11[7].quantity === 2 && res11[7].unit === 'rolls' && res11[7].item_description.includes('DPC membrane 30m'), 'Case 8 preserved: 2 rolls DPC membrane 30m');

console.log('\n====================================================');
console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('ALL STAGE 2 TESTS PASSED PERFECTLY!');
}
