/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Quotation Text Parser & Safe Price Matching Engine
 * Accurately distinguishes quantities from dimensions, measurements, and specifications.
 * Enforces strict material, dimension, and unit safety rules.
 */

import {
  PriceItem,
  QuotationLineItem,
  StructuredImportRow,
  StructuredImportResult,
  PriceLibraryImportProposal,
  ProductCategory,
} from '../types';
import { multMoney, round2, subMoney } from './math';

export interface ParsedRawLine {
  quantity: number;
  unit: string;
  description: string;
  raw: string;
  is_ambiguous?: boolean;
  review_reason?: string;
}

export interface PriceMatchResult {
  matchedItem: PriceItem | null;
  isExact: boolean;
  isAmbiguous: boolean;
  candidates: PriceItem[];
}

export const COMMON_UNITS = [
  'lengths',
  'length',
  'rolls',
  'roll',
  'boxes',
  'box',
  'metres',
  'metre',
  'meters',
  'meter',
  'm',
  'bags',
  'bag',
  'sheets',
  'sheet',
  'bundles',
  'bundle',
  'pairs',
  'pair',
  'packs',
  'pack',
  'buckets',
  'bucket',
  'tins',
  'tin',
  'pcs',
  'pc',
  'pieces',
  'piece',
  'sets',
  'set',
];

const KNOWN_MATERIALS = [
  'pvc',
  'upvc',
  'cpvc',
  'copper',
  'brass',
  'galvanized',
  'galv',
  'steel',
  'mild steel',
  'stainless',
  'cast iron',
  'iron',
  'timber',
  'pine',
  'hardwood',
  'plastic',
  'nylon',
  'aluminum',
  'aluminium',
  'chrome',
  'rubber',
];

/**
 * Generates collision-resistant unique IDs without relying on Date.now() alone
 */
export function generateUniqueId(prefix: string = 'item'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${rand}`;
}

/**
 * Normalizes hardware strings: lowercases, trims whitespace, normalizes separators
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s*.\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Standardizes a product name for exact matching comparison:
 * Extracts tokens, singularizes common nouns, and sorts them.
 */
export function standardizeProductName(name: string): string {
  return normalizeText(name)
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      // Remove trailing 's' on common nouns of length > 3
      if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
      }
      return word;
    })
    .sort()
    .join(' ');
}

/**
 * Extracts all dimension and measurement tokens from a description:
 * e.g. "15mm", "19mm", "2x4", "3*2", "30m", "50kg", "3-inch"
 */
export function extractDimensions(text: string): string[] {
  const normalized = normalizeText(text);
  const dimensions: string[] = [];

  // Metric dimensions: 15mm, 15 mm, 1.5m, 30m, 50cm, etc.
  const metricRegex = /\b(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = metricRegex.exec(normalized)) !== null) {
    dimensions.push(`${match[1]}${match[2].toLowerCase()}`);
  }

  // Cross-sectional dimensions: 2x4, 3*2, 3x2, 4x2, 2*4
  const crossRegex = /\b(\d+)\s*([x*])\s*(\d+)\b/gi;
  while ((match = crossRegex.exec(normalized)) !== null) {
    dimensions.push(`${match[1]}x${match[3]}`);
  }

  // Imperial sizes: 3/4 inch, 1/2", 3-inch, 4 inch
  const imperialRegex = /\b(\d+(?:\/\d+)?|\d+-\w+)\s*(?:inch|inches|in|")\b/gi;
  while ((match = imperialRegex.exec(normalized)) !== null) {
    dimensions.push(match[0].replace(/\s+/g, '').toLowerCase());
  }

  // Weights/volumes: 50kg, 20l, 5l
  const weightRegex = /\b(\d+(?:\.\d+)?)\s*(kg|g|litre|litres|l|ltr|ml|bar)\b/gi;
  while ((match = weightRegex.exec(normalized)) !== null) {
    dimensions.push(`${match[1]}${match[2].toLowerCase()}`);
  }

  return Array.from(new Set(dimensions)).sort();
}

/**
 * Extracts material tokens from text: pvc, copper, brass, timber, etc.
 */
export function extractMaterials(text: string): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/);
  const materials: string[] = [];

  for (const mat of KNOWN_MATERIALS) {
    if (words.includes(mat) || normalized.includes(mat)) {
      materials.push(mat === 'galv' ? 'galvanized' : mat === 'aluminium' ? 'aluminum' : mat);
    }
  }

  return Array.from(new Set(materials)).sort();
}

/**
 * Extracts core noun words excluding materials, dimensions, and stop words
 */
export function extractCoreWords(text: string): string[] {
  const normalized = normalizeText(text);
  const dims = extractDimensions(text);
  const mats = extractMaterials(text);

  let clean = normalized;
  // strip out materials and measurements
  dims.forEach((d) => {
    clean = clean.replace(new RegExp(d.replace(/[*.]/g, '\\$&'), 'gi'), ' ');
  });
  mats.forEach((m) => {
    clean = clean.replace(new RegExp(`\\b${m}\\b`, 'gi'), ' ');
  });

  const stopWords = new Set(['of', 'and', 'the', 'for', 'with', 'in', 'x', '*']);

  return clean
    .split(/\s+/)
    .filter((w) => w && !stopWords.has(w) && !/^\d+$/.test(w))
    .map((w) => {
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
        return w.slice(0, -1);
      }
      return w;
    })
    .sort();
}

/**
 * Parses a single line of raw quotation text
 * Distinguishes quantities from dimensions, measurements, and specifications.
 */
export function parseQuotationLine(line: string): ParsedRawLine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null;
  }

  // -------------------------------------------------------------
  // RULE A: Check if line STARTS with a dimensional cross-section
  // Examples: "3*2 timber", "2x4 timber", "3x2 timber", "4x2 timber"
  // The leading "3*2" or "2x4" is a dimensional specification, NOT quantity!
  // Guard against: "20 x 15 mm copper elbows" where 15 is followed by mm/cm/units
  // -------------------------------------------------------------
  const dimensionalStartRegex = /^(\d{1,2}\s*[x*X]\s*\d{1,2}(?:\s*[x*X]\s*\d{1,2})?)\s+(?!(?:mm|cm|m|kg|g|gauge|ga|v|w|amp|bar|x|\*)\b)(.+)$/i;
  const dimStartMatch = trimmed.match(dimensionalStartRegex);
  if (dimStartMatch) {
    return {
      quantity: 1,
      unit: 'pcs',
      description: trimmed,
      raw: trimmed,
      is_ambiguous: true,
      review_reason: 'Starts with cross-sectional dimension (e.g. 2x4 / 3*2). Quantity defaulted to 1.',
    };
  }

  // -------------------------------------------------------------
  // RULE B: Check if line STARTS with a measurement with attached unit
  // Examples: "19mm PVC pipe", "15 mm copper pipe", "50kg cement", "30m hose"
  // The leading number is a measurement parameter, NOT a quantity!
  // -------------------------------------------------------------
  const measurementStartRegex = /^(\d+(?:\.\d+)?)\s*(mm|cm|m|inch|inches|in|"|'|ga|gauge|kg|g|v|w|amp|amps|bar|litre|l|ltr)\b\s*(.*)$/i;
  const measureStartMatch = trimmed.match(measurementStartRegex);
  if (measureStartMatch) {
    return {
      quantity: 1,
      unit: 'pcs',
      description: trimmed,
      raw: trimmed,
      is_ambiguous: true,
      review_reason: 'Starts with size measurement (e.g. 19mm / 15mm). Quantity defaulted to 1.',
    };
  }

  // -------------------------------------------------------------
  // RULE C: Leading quantity with explicit separator "x" or "*"
  // Examples:
  // "2 x PVC pipes 19mm" -> qty: 2, desc: "PVC pipes 19mm"
  // "20 x 15 mm copper elbows" -> qty: 20, desc: "15 mm copper elbows"
  // "100 x Coupling" -> qty: 100, desc: "Coupling"
  // "10 x 2x4 timber" -> qty: 10, desc: "2x4 timber"
  // -------------------------------------------------------------
  const quantityXRegex = /^(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(.+)$/i;
  const matchX = trimmed.match(quantityXRegex);
  if (matchX) {
    const qty = parseFloat(matchX[1]);
    const remainder = matchX[2].trim();

    // Check if remainder has an attached unit prefix: e.g. "lengths of 15 mm copper pipe" or "lengths 2x4 timber"
    const unitPrefixRegex = new RegExp(`^(${COMMON_UNITS.join('|')})\\b(?:\\s+(?:of\\s+)?(.+))?$`, 'i');
    const unitMatch = remainder.match(unitPrefixRegex);
    if (unitMatch) {
      return {
        quantity: qty,
        unit: unitMatch[1].toLowerCase(),
        description: (unitMatch[2] || '').trim(),
        raw: trimmed,
      };
    }

    return {
      quantity: qty,
      unit: 'pcs',
      description: remainder,
      raw: trimmed,
    };
  }

  // -------------------------------------------------------------
  // RULE D: Leading quantity followed by recognized unit
  // Examples:
  // "8 lengths of 15 mm copper pipe" -> qty: 8, unit: "lengths", desc: "15 mm copper pipe"
  // "2 rolls DPC membrane 30m" -> qty: 2, unit: "rolls", desc: "DPC membrane 30m"
  // "10 bags cement 32.5R" -> qty: 10, unit: "bags", desc: "cement 32.5R"
  // -------------------------------------------------------------
  const unitRegex = new RegExp(
    `^(\\d+(?:\\.\\d+)?)\\s+(${COMMON_UNITS.join('|')})\\b(?:\\s+(?:of\\s+)?(.+))?$`,
    'i'
  );
  const matchUnit = trimmed.match(unitRegex);
  if (matchUnit) {
    return {
      quantity: parseFloat(matchUnit[1]),
      unit: matchUnit[2].toLowerCase(),
      description: (matchUnit[3] || '').trim(),
      raw: trimmed,
    };
  }

  // -------------------------------------------------------------
  // RULE E: Leading integer/number followed by words
  // e.g. "12 Round boxes" -> qty: 12, desc: "Round boxes"
  // BUT guard against measurements like "19 mm PVC pipe"
  // -------------------------------------------------------------
  const plainNumRegex = /^(\d+(?:\.\d+)?)\s+([a-zA-Z].*)$/;
  const matchPlain = trimmed.match(plainNumRegex);
  if (matchPlain) {
    const numPart = matchPlain[1];
    const rest = matchPlain[2].trim();

    // Guard: check if the first word in rest is a measurement suffix
    const firstWord = rest.split(/\s+/)[0].toLowerCase();
    const measurementSuffixes = [
      'mm',
      'cm',
      'in',
      'inch',
      'inches',
      'gauge',
      'kg',
      'g',
      'v',
      'w',
      'amp',
      'amps',
      'bar',
      'm',
      'ltr',
      'litre',
    ];
    if (measurementSuffixes.includes(firstWord)) {
      return {
        quantity: 1,
        unit: 'pcs',
        description: trimmed,
        raw: trimmed,
        is_ambiguous: true,
        review_reason: 'Starts with measurement parameter (defaulted to 1 qty)',
      };
    }

    return {
      quantity: parseFloat(numPart),
      unit: 'pcs',
      description: rest,
      raw: trimmed,
    };
  }

  // -------------------------------------------------------------
  // DEFAULT FALLBACK: Line has no detected quantity prefix
  // Retain entire line as description, default qty 1
  // -------------------------------------------------------------
  return {
    quantity: 1,
    unit: 'pcs',
    description: trimmed,
    raw: trimmed,
    is_ambiguous: true,
    review_reason: 'No explicit quantity prefix detected (defaulted to 1).',
  };
}

/**
 * Safe Price Library Matcher:
 * - Exact normalized matches may auto-fill.
 * - Different sizes MUST NEVER match (e.g. PVC Coupling 15mm != PVC Coupling 20mm).
 * - Different materials MUST NEVER match (e.g. Copper Elbow 15mm != PVC Elbow 15mm).
 * - Different units must not be treated as interchangeable.
 * - Ambiguous matches return candidate suggestions, requiring explicit user confirmation.
 */
export function findMatchingPriceItem(
  description: string,
  priceLibrary: PriceItem[]
): PriceItem | null {
  const result = matchProductWithLibrary(description, priceLibrary);
  return result.matchedItem;
}

/**
 * Detailed matcher that returns exact match, ambiguity flag, and candidates
 */
export function matchProductWithLibrary(
  description: string,
  priceLibrary: PriceItem[]
): PriceMatchResult {
  if (!description || !priceLibrary || priceLibrary.length === 0) {
    return { matchedItem: null, isExact: false, isAmbiguous: false, candidates: [] };
  }

  const queryDims = extractDimensions(description);
  const queryMats = extractMaterials(description);
  const queryCore = extractCoreWords(description);
  const queryStd = standardizeProductName(description);

  // 1. Check exact standardized name match
  const exact = priceLibrary.find((item) => {
    return item.standardized_name === queryStd;
  });
  if (exact) {
    return { matchedItem: exact, isExact: true, isAmbiguous: false, candidates: [exact] };
  }

  // 2. Check normalized string match
  const normalizedDesc = normalizeText(description);
  const literal = priceLibrary.find(
    (item) => normalizeText(item.product_name) === normalizedDesc
  );
  if (literal) {
    return { matchedItem: literal, isExact: true, isAmbiguous: false, candidates: [literal] };
  }

  // 3. Structural comparison checking materials, dimensions, and core words
  const validCandidates: PriceItem[] = [];

  for (const item of priceLibrary) {
    const itemDims = extractDimensions(item.product_name);
    const itemMats = extractMaterials(item.product_name);
    const itemCore = extractCoreWords(item.product_name);

    // CRITICAL SAFETY RULE 1: If both have dimensions, they MUST be identical!
    if (queryDims.length > 0 && itemDims.length > 0) {
      const sameDims =
        queryDims.length === itemDims.length && queryDims.every((d) => itemDims.includes(d));
      if (!sameDims) {
        // Different sizes (e.g. 15mm vs 20mm) MUST NEVER MATCH!
        continue;
      }
    } else if (queryDims.length !== itemDims.length) {
      // One has a dimension and the other does not (e.g. "PVC pipe 19mm" vs "PVC pipe")
      // Cannot be an automatic exact match!
      // If core matches, it's an ambiguous candidate
      const coreOverlaps =
        queryCore.length > 0 &&
        itemCore.length > 0 &&
        queryCore.every((w) => itemCore.includes(w));
      if (coreOverlaps) {
        validCandidates.push(item);
      }
      continue;
    }

    // CRITICAL SAFETY RULE 2: If both have materials, they MUST be identical!
    if (queryMats.length > 0 && itemMats.length > 0) {
      const sameMats =
        queryMats.length === itemMats.length && queryMats.every((m) => itemMats.includes(m));
      if (!sameMats) {
        // Different materials (e.g. Copper vs PVC) MUST NEVER MATCH!
        continue;
      }
    } else if (queryMats.length !== itemMats.length) {
      // One has a material and other doesn't
      const coreOverlaps =
        queryCore.length > 0 &&
        itemCore.length > 0 &&
        queryCore.every((w) => itemCore.includes(w));
      if (coreOverlaps) {
        validCandidates.push(item);
      }
      continue;
    }

    // CRITICAL SAFETY RULE 3: Core noun words check
    const sameCore =
      queryCore.length > 0 &&
      queryCore.length === itemCore.length &&
      queryCore.every((w) => itemCore.includes(w));

    if (sameCore) {
      // Dimensions match (or both absent), materials match (or both absent), core nouns match
      // This is a verified exact match!
      return { matchedItem: item, isExact: true, isAmbiguous: false, candidates: [item] };
    }

    // If core words partially overlap, save as candidate
    const partialCore =
      queryCore.length > 0 &&
      itemCore.length > 0 &&
      (queryCore.some((w) => itemCore.includes(w)) || itemCore.some((w) => queryCore.includes(w)));
    if (partialCore) {
      validCandidates.push(item);
    }
  }

  // If there are candidates but no exact match, it is ambiguous
  if (validCandidates.length > 0) {
    return {
      matchedItem: null, // DO NOT AUTO-FILL SILENTLY
      isExact: false,
      isAmbiguous: true,
      candidates: validCandidates.slice(0, 5),
    };
  }

  return { matchedItem: null, isExact: false, isAmbiguous: false, candidates: [] };
}

/**
 * Parses raw text into QuotationLineItems, resolving known prices safely
 */
export function parseRawQuotationText(
  rawText: string,
  priceLibrary: PriceItem[] = []
): QuotationLineItem[] {
  const lines = rawText.split(/\r?\n/);
  const items: QuotationLineItem[] = [];

  for (const line of lines) {
    const parsed = parseQuotationLine(line);
    if (!parsed || !parsed.description) continue;

    const matchResult = matchProductWithLibrary(parsed.description, priceLibrary);
    const matched = matchResult.matchedItem;

    const unitPrice = matched ? matched.current_unit_price : 0;
    const unit = matched?.unit || parsed.unit || 'pcs';
    const lineTotal = multMoney(unitPrice, parsed.quantity);

    items.push({
      id: generateUniqueId('qi'),
      raw_input: parsed.raw,
      item_description: parsed.description,
      quantity: parsed.quantity,
      unit: unit,
      unit_price: unitPrice,
      line_total: lineTotal,
      matched_from_library: !!matched,
      is_ambiguous: parsed.is_ambiguous || matchResult.isAmbiguous,
      review_reason: parsed.review_reason || (matchResult.isAmbiguous ? 'Multiple possible price catalog items found' : undefined),
    });
  }

  return items;
}

// =========================================================================
// STAGE 2: STRUCTURED QUOTATION IMPORT & PRICE LEARNING ENGINE
// =========================================================================

export const HEADER_DESCRIPTION_ALIASES = [
  'item',
  'description',
  'item description',
  'product',
  'product description',
  'product name',
  'particulars',
  'name',
  'material',
  'materials',
  'details',
  'spec',
  'specification',
  'items',
  'desc',
];

export const HEADER_QUANTITY_ALIASES = [
  'qty',
  'quantity',
  'quant',
  'qnty',
  'count',
  'no',
  'pcs',
  'pieces',
  'units',
  'number',
  'order qty',
];

export const HEADER_UNIT_ALIASES = [
  'unit',
  'uom',
  'measure',
  'unit of measure',
  'pkg',
];

export const HEADER_UNIT_PRICE_ALIASES = [
  'unit price',
  'unit_price',
  'price',
  'rate',
  'price each',
  'price/unit',
  'unit cost',
  'cost',
  'rate ($)',
  'price ($)',
  'unit price ($)',
  'u/price',
  'rate each',
  'unit rate',
];

export const HEADER_TOTAL_ALIASES = [
  'total',
  'total price',
  'amount',
  'line total',
  'total amount',
  'ext price',
  'extended price',
  'net amount',
  'total ($)',
  'amount ($)',
  'total cost',
  'sub total',
  'value',
];

export const SUMMARY_ROW_KEYWORDS = [
  'subtotal',
  'sub-total',
  'sub total',
  'grand total',
  'total amount due',
  'total due',
  'balance due',
  'vat',
  'tax',
  'discount',
  'deposit',
  'balance',
  'amount payable',
  'net total',
  'total usd',
  'grand total ($)',
];

export const METADATA_ROW_KEYWORDS = [
  'quotation',
  'quote #',
  'quote no',
  'quotation number',
  'quotation ref',
  'customer',
  'client',
  'customer name',
  'date:',
  'valid until',
  'validity',
  'prepared by',
  'attn:',
  'attention',
  'terms and conditions',
  'payment terms',
  'bank details',
  'banking details',
  'account no',
  'ecocash',
  'phone:',
  'tel:',
  'email:',
  'address:',
];

export interface ColumnMapping {
  descriptionIndex: number;
  quantityIndex: number;
  unitIndex: number;
  unitPriceIndex: number;
  totalIndex: number;
}

/**
 * Parses a single CSV line taking quoted commas and smart/curled quotes into account
 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (!inQuotes && (char === '"' || char === "'" || char === '“' || char === '”')) {
      inQuotes = true;
      quoteChar = char === '“' ? '”' : char;
    } else if (
      inQuotes &&
      (char === quoteChar ||
        (quoteChar === '”' && (char === '”' || char === '"')) ||
        (quoteChar === '"' && char === '"'))
    ) {
      inQuotes = false;
    } else if (!inQuotes && char === ',') {
      cells.push(current.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim());
  return cells;
}

/**
 * Splits a tabular raw line into distinct column cells
 * Supports: Tab-separated, Pipe-separated, CSV with quotes, Semicolons, and 2+ Whitespace columns.
 */
export function splitRowIntoCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // 1. Tab separated (Excel/Google Sheets copy paste)
  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map((c) => c.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim());
  }

  // 2. Pipe separated (| Item | Qty | Price |)
  if (trimmed.includes('|')) {
    const rawCells = trimmed.split('|');
    const startIdx = rawCells[0].trim() === '' ? 1 : 0;
    const endIdx =
      rawCells[rawCells.length - 1].trim() === '' ? rawCells.length - 1 : rawCells.length;
    const cells = rawCells.slice(startIdx, endIdx).map((c) => c.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim());
    if (cells.length > 0) return cells;
  }

  // 3. Comma separated (CSV), handles quoted values
  if (trimmed.includes(',')) {
    const cells = parseCsvLine(trimmed);
    if (cells.length > 1) {
      return cells;
    }
  }

  // 4. Semicolon separated
  if (trimmed.includes(';')) {
    const cells = trimmed.split(';').map((c) => c.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim());
    if (cells.length > 1) return cells;
  }

  // 5. Multiple whitespace columns (aligned tables)
  if (/\s{2,}/.test(trimmed)) {
    return trimmed.split(/\s{2,}/).map((c) => c.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim());
  }

  return [trimmed];
}

/**
 * Safely parses monetary or quantity cell values.
 * Handles currency symbols ($ USD ZiG R), thousands commas (1,200.00), and quotes.
 */
export function parseNumericCell(raw: string): { value: number | null; isValid: boolean } {
  if (!raw || typeof raw !== 'string') return { value: null, isValid: false };

  let clean = raw.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  // Strip currency prefixes and suffixes
  clean = clean.replace(/^(USD|ZIG|ZWL|ZAR|USD\$|\$|R|£|€)\s*/i, '').trim();
  clean = clean.replace(/\s*(USD|ZIG|ZWL|ZAR)$/i, '').trim();

  if (!clean) return { value: null, isValid: false };

  // Remove commas used as thousands separators: e.g. "1,200.00" -> "1200.00"
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(clean)) {
    clean = clean.replace(/,/g, '');
  } else if (/^[-+]?\d+,\d{2}$/.test(clean)) {
    clean = clean.replace(',', '.');
  } else {
    clean = clean.replace(/,/g, '');
  }

  const num = parseFloat(clean);
  if (isNaN(num) || !isFinite(num)) {
    return { value: null, isValid: false };
  }
  return { value: round2(num), isValid: true };
}

/**
 * Classifies a single header cell against known aliases
 */
function classifyHeaderCell(cell: string): 'description' | 'quantity' | 'unit' | 'unit_price' | 'total' | null {
  const norm = cell.toLowerCase().trim().replace(/[^\w\s/]/g, '').replace(/\s+/g, ' ');

  // 1. Unit price checks first before generic 'unit'
  if (HEADER_UNIT_PRICE_ALIASES.some((a) => norm === a || norm.startsWith(a))) {
    return 'unit_price';
  }
  // 2. Total / Amount
  if (HEADER_TOTAL_ALIASES.some((a) => norm === a || norm.startsWith(a))) {
    return 'total';
  }
  // 3. Quantity
  if (HEADER_QUANTITY_ALIASES.some((a) => norm === a || norm.startsWith(a))) {
    return 'quantity';
  }
  // 4. Unit
  if (HEADER_UNIT_ALIASES.some((a) => norm === a)) {
    return 'unit';
  }
  // 5. Description / Item
  if (HEADER_DESCRIPTION_ALIASES.some((a) => norm === a || norm.startsWith(a))) {
    return 'description';
  }
  return null;
}

/**
 * Checks if a row is a table header row and establishes the column mapping
 */
export function classifyHeaderRow(cells: string[]): { isHeader: boolean; mapping: ColumnMapping } {
  const mapping: ColumnMapping = {
    descriptionIndex: -1,
    quantityIndex: -1,
    unitIndex: -1,
    unitPriceIndex: -1,
    totalIndex: -1,
  };

  let recognizedCount = 0;

  for (let i = 0; i < cells.length; i++) {
    const classification = classifyHeaderCell(cells[i]);
    if (classification === 'description' && mapping.descriptionIndex === -1) {
      mapping.descriptionIndex = i;
      recognizedCount++;
    } else if (classification === 'quantity' && mapping.quantityIndex === -1) {
      mapping.quantityIndex = i;
      recognizedCount++;
    } else if (classification === 'unit' && mapping.unitIndex === -1) {
      mapping.unitIndex = i;
      recognizedCount++;
    } else if (classification === 'unit_price' && mapping.unitPriceIndex === -1) {
      mapping.unitPriceIndex = i;
      recognizedCount++;
    } else if (classification === 'total' && mapping.totalIndex === -1) {
      mapping.totalIndex = i;
      recognizedCount++;
    }
  }

  // If at least two header columns were matched, this is definitely a header row
  const isHeader = recognizedCount >= 2;
  return { isHeader, mapping };
}

/**
 * Determines whether a line is a summary row (e.g. Subtotal, Grand Total) or metadata row
 */
export function isSummaryOrMetadataRow(cells: string[], rawLine: string): { isSummary: boolean; isMetadata: boolean; label?: string } {
  if (cells.length === 0) return { isSummary: false, isMetadata: false };

  const first = cells[0].toLowerCase().trim().replace(/[^\w\s]/g, '');
  const combined = cells.join(' ').toLowerCase().trim();

  // 1. Explicit summary keywords in first cell or whole row
  for (const kw of SUMMARY_ROW_KEYWORDS) {
    if (first === kw || first.startsWith(kw)) {
      return { isSummary: true, isMetadata: false, label: cells[0] };
    }
  }

  // 2. Check metadata keywords
  for (const meta of METADATA_ROW_KEYWORDS) {
    if (combined.startsWith(meta) || first.startsWith(meta)) {
      return { isSummary: false, isMetadata: true, label: cells[0] };
    }
  }

  // 3. Check markdown table divider rows (e.g. |---|---|)
  if (/^[:\-\s|]+$/.test(rawLine)) {
    return { isSummary: false, isMetadata: true, label: 'divider' };
  }

  return { isSummary: false, isMetadata: false };
}

/**
 * Infers column mapping for tabular data when no explicit header row was present
 */
function inferColumnMapping(cellsList: string[][]): ColumnMapping {
  const mapping: ColumnMapping = {
    descriptionIndex: 0,
    quantityIndex: 1,
    unitIndex: -1,
    unitPriceIndex: 2,
    totalIndex: 3,
  };

  if (cellsList.length === 0) return mapping;
  const firstDataRow = cellsList[0];

  if (firstDataRow.length === 3) {
    // Description, Quantity, Unit Price
    mapping.descriptionIndex = 0;
    mapping.quantityIndex = 1;
    mapping.unitPriceIndex = 2;
    mapping.totalIndex = -1;
  } else if (firstDataRow.length === 4) {
    // Check if column 0 is numeric (Qty) and column 1 is text (Description)
    const col0Num = parseNumericCell(firstDataRow[0]);
    const col1Num = parseNumericCell(firstDataRow[1]);
    if (col0Num.isValid && !col1Num.isValid) {
      mapping.quantityIndex = 0;
      mapping.descriptionIndex = 1;
      mapping.unitPriceIndex = 2;
      mapping.totalIndex = 3;
    } else {
      mapping.descriptionIndex = 0;
      mapping.quantityIndex = 1;
      mapping.unitPriceIndex = 2;
      mapping.totalIndex = 3;
    }
  } else if (firstDataRow.length >= 5) {
    mapping.descriptionIndex = 0;
    mapping.quantityIndex = 1;
    mapping.unitIndex = 2;
    mapping.unitPriceIndex = 3;
    mapping.totalIndex = 4;
  }

  return mapping;
}

/**
 * PARSES STRUCTURED COMPLETED QUOTATIONS (WORKFLOW B & C)
 * Extracts Description, Quantity, Unit Price, and Total Price from multi-column data.
 * Detects headers, maps variable column order, ignores summary rows, and flags arithmetic discrepancies.
 */
export function parseStructuredQuotationText(
  rawText: string,
  priceLibrary: PriceItem[] = []
): StructuredImportResult {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let detectedHeaders: string[] = [];
  let columnMapping: ColumnMapping = {
    descriptionIndex: -1,
    quantityIndex: -1,
    unitIndex: -1,
    unitPriceIndex: -1,
    totalIndex: -1,
  };

  const validRows: StructuredImportRow[] = [];
  const discrepancyRows: StructuredImportRow[] = [];
  const unrecognizedRows: StructuredImportRow[] = [];
  const summaryRows: StructuredImportRow[] = [];
  const allRows: StructuredImportRow[] = [];

  let headerFound = false;
  const candidateDataLines: { rawLine: string; cells: string[] }[] = [];

  // Pass 1: Header and Row Classification
  for (const line of lines) {
    const cells = splitRowIntoCells(line);
    if (cells.length === 0) continue;

    // Check if this row is a column header row
    if (!headerFound) {
      const headerCheck = classifyHeaderRow(cells);
      if (headerCheck.isHeader) {
        headerFound = true;
        detectedHeaders = cells;
        columnMapping = headerCheck.mapping;

        // If totalIndex or unitPriceIndex were not explicitly mapped in a 4-col header, fill reasonable default
        if (columnMapping.descriptionIndex === -1) columnMapping.descriptionIndex = 0;
        if (columnMapping.quantityIndex === -1) columnMapping.quantityIndex = 1;
        if (columnMapping.unitPriceIndex === -1 && columnMapping.totalIndex !== 2) columnMapping.unitPriceIndex = 2;
        if (columnMapping.totalIndex === -1 && columnMapping.unitPriceIndex !== 3) columnMapping.totalIndex = 3;
        continue;
      }
    }

    // Check summary or metadata row
    const checkSummary = isSummaryOrMetadataRow(cells, line);
    if (checkSummary.isSummary) {
      const summaryTotal = cells.length > 1 ? parseNumericCell(cells[cells.length - 1]).value || 0 : 0;
      summaryRows.push({
        id: generateUniqueId('s-sum'),
        raw_line: line,
        item_description: cells[0] || 'Summary',
        quantity: 1,
        unit: 'total',
        unit_price: summaryTotal,
        supplied_total: summaryTotal,
        calculated_total: summaryTotal,
        has_discrepancy: false,
        is_valid: false,
        status: 'summary',
        review_reason: 'Recognized summary / grand total row (excluded from product list)',
      });
      continue;
    }

    if (checkSummary.isMetadata) {
      continue; // Skip document titles, client headers, divider lines
    }

    candidateDataLines.push({ rawLine: line, cells });
  }

  // If no explicit header row was detected, infer column mapping from data
  if (!headerFound && candidateDataLines.length > 0) {
    columnMapping = inferColumnMapping(candidateDataLines.map((d) => d.cells));
  }

  // Pass 2: Extract and Validate Line Items
  for (const { rawLine, cells } of candidateDataLines) {
    // If line only has 1 cell and it's not a table row
    if (cells.length === 1 && !headerFound) {
      unrecognizedRows.push({
        id: generateUniqueId('s-unrec'),
        raw_line: rawLine,
        item_description: cells[0],
        quantity: 1,
        unit: 'pcs',
        unit_price: 0,
        supplied_total: 0,
        calculated_total: 0,
        has_discrepancy: false,
        is_valid: false,
        status: 'unrecognized',
        review_reason: 'Could not separate line into tabular columns',
      });
      continue;
    }

    // Extract Description
    const descIdx = columnMapping.descriptionIndex >= 0 ? columnMapping.descriptionIndex : 0;
    const rawDesc = cells[descIdx] || '';
    const itemDescription = rawDesc.replace(/^["'“”]+|["'“”]+$/g, '').trim();

    // Check if description itself is a summary row (e.g. "Total" or "Subtotal")
    if (SUMMARY_ROW_KEYWORDS.some((kw) => itemDescription.toLowerCase() === kw || itemDescription.toLowerCase().startsWith(kw))) {
      summaryRows.push({
        id: generateUniqueId('s-sum'),
        raw_line: rawLine,
        item_description: itemDescription,
        quantity: 1,
        unit: 'total',
        unit_price: 0,
        supplied_total: 0,
        calculated_total: 0,
        has_discrepancy: false,
        is_valid: false,
        status: 'summary',
        review_reason: 'Summary row detected (excluded from product list)',
      });
      continue;
    }

    // Extract Quantity
    const qtyIdx = columnMapping.quantityIndex >= 0 ? columnMapping.quantityIndex : 1;
    const rawQty = cells[qtyIdx];
    const parsedQty = parseNumericCell(rawQty);

    // Extract Unit
    let unit = 'pcs';
    if (columnMapping.unitIndex >= 0 && cells[columnMapping.unitIndex]) {
      unit = cells[columnMapping.unitIndex].toLowerCase().trim() || 'pcs';
    }

    // Extract Unit Price
    const priceIdx = columnMapping.unitPriceIndex >= 0 ? columnMapping.unitPriceIndex : 2;
    const rawPrice = cells[priceIdx];
    const parsedPrice = parseNumericCell(rawPrice);

    // Extract Total
    const totalIdx = columnMapping.totalIndex >= 0 ? columnMapping.totalIndex : 3;
    const rawTotal = totalIdx >= 0 ? cells[totalIdx] : undefined;
    const parsedTotal = rawTotal !== undefined ? parseNumericCell(rawTotal) : { value: null, isValid: false };

    // Validation flags
    const hasValidDesc = itemDescription.length > 0;
    const hasValidQty = parsedQty.isValid && parsedQty.value !== null && parsedQty.value > 0;
    const hasValidPrice = parsedPrice.isValid && parsedPrice.value !== null && parsedPrice.value >= 0;

    const quantity = hasValidQty ? parsedQty.value! : 0;
    const unitPrice = hasValidPrice ? parsedPrice.value! : 0;
    const calculatedTotal = multMoney(unitPrice, quantity);
    const suppliedTotal = parsedTotal.isValid && parsedTotal.value !== null ? parsedTotal.value : calculatedTotal;

    // Check arithmetic discrepancy
    let hasDiscrepancy = false;
    let discrepancyReason: string | undefined;

    if (parsedTotal.isValid && parsedTotal.value !== null && hasValidQty && hasValidPrice) {
      const diff = Math.abs(subMoney(parsedTotal.value, calculatedTotal));
      if (diff > 0.02) {
        hasDiscrepancy = true;
        discrepancyReason = `Supplied total ($${parsedTotal.value.toFixed(2)}) differs from Qty (${quantity}) × Price ($${unitPrice.toFixed(2)}) = $${calculatedTotal.toFixed(2)}`;
      }
    }

    // Price catalog matching
    const matchResult = matchProductWithLibrary(itemDescription, priceLibrary);
    const matchedItem = matchResult.matchedItem;
    const isAmbiguousMatch = matchResult.isAmbiguous;

    let rowStatus: 'valid' | 'discrepancy' | 'invalid_numeric' | 'ambiguous' | 'unrecognized' = 'valid';
    let reviewReason: string | undefined;

    if (!hasValidDesc) {
      rowStatus = 'unrecognized';
      reviewReason = 'Missing product description';
    } else if (!hasValidQty) {
      rowStatus = 'invalid_numeric';
      reviewReason = 'Invalid or missing quantity';
    } else if (!hasValidPrice) {
      rowStatus = 'invalid_numeric';
      reviewReason = 'Invalid or missing unit price';
    } else if (hasDiscrepancy) {
      rowStatus = 'discrepancy';
      reviewReason = discrepancyReason;
    } else if (isAmbiguousMatch) {
      rowStatus = 'ambiguous';
      reviewReason = 'Ambiguous catalog match - check product specifications';
    }

    const rowObj: StructuredImportRow = {
      id: generateUniqueId('str-row'),
      raw_line: rawLine,
      item_description: itemDescription,
      quantity,
      unit,
      unit_price: unitPrice,
      supplied_total: suppliedTotal,
      calculated_total: calculatedTotal,
      has_discrepancy: hasDiscrepancy,
      is_valid: hasValidDesc && hasValidQty && hasValidPrice,
      status: rowStatus,
      review_reason: reviewReason,
      matched_price_item: matchedItem,
      is_ambiguous_match: isAmbiguousMatch,
    };

    allRows.push(rowObj);

    if (rowStatus === 'valid' || rowStatus === 'ambiguous') {
      validRows.push(rowObj);
    } else if (rowStatus === 'discrepancy') {
      discrepancyRows.push(rowObj);
    } else {
      unrecognizedRows.push(rowObj);
    }
  }

  return {
    headersDetected: detectedHeaders,
    columnMapping,
    validRows,
    discrepancyRows,
    unrecognizedRows,
    summaryRows,
    allRows,
  };
}

/**
 * PREPARES PRICE LIBRARY IMPORT PROPOSALS (WORKFLOW C)
 * Extracts catalog prices from imported completed quotation.
 * Uses Unit Price as proposed catalog price.
 * Ignores Quantity and Total Price when setting catalog unit price.
 * Detects conflicts when the same product appears multiple times with differing unit prices.
 * Evaluates against existing Price Library with safe matching.
 */
export function preparePriceLibraryImport(
  rows: StructuredImportRow[],
  priceLibrary: PriceItem[] = []
): PriceLibraryImportProposal[] {
  // Group rows by standardized product name to detect conflicting prices within document
  const grouped = new Map<string, { rows: StructuredImportRow[]; prices: Set<number> }>();

  for (const row of rows) {
    const desc = row.item_description.trim();
    if (!desc || row.unit_price <= 0) continue;

    const std = standardizeProductName(desc);
    if (!grouped.has(std)) {
      grouped.set(std, { rows: [], prices: new Set() });
    }
    const entry = grouped.get(std)!;
    entry.rows.push(row);
    entry.prices.add(row.unit_price);
  }

  const proposals: PriceLibraryImportProposal[] = [];

  grouped.forEach((entry, std) => {
    const firstRow = entry.rows[0];
    const pricesArray = Array.from(entry.prices);
    const hasConflict = pricesArray.length > 1;

    // Match against existing library
    const matchResult = matchProductWithLibrary(firstRow.item_description, priceLibrary);
    const existing = matchResult.matchedItem;
    const isAmbiguous = matchResult.isAmbiguous;

    let status: 'new' | 'update' | 'same' | 'conflict' | 'ambiguous' = 'new';
    let reviewReason: string | undefined;
    let selected = false;

    if (hasConflict) {
      status = 'conflict';
      selected = false;
      reviewReason = `Conflicting unit prices found in document: ${pricesArray.map((p) => `$${p.toFixed(2)}`).join(', ')}`;
    } else if (isAmbiguous) {
      status = 'ambiguous';
      selected = false;
      reviewReason = 'Ambiguous catalog match - verify product specifications before adding';
    } else if (existing) {
      if (existing.current_unit_price === firstRow.unit_price) {
        status = 'same';
        selected = false;
        reviewReason = `Current catalog price already matches ($${firstRow.unit_price.toFixed(2)})`;
      } else {
        status = 'update';
        selected = true;
        reviewReason = `Catalog price: $${existing.current_unit_price.toFixed(2)} → Proposed: $${firstRow.unit_price.toFixed(2)}`;
      }
    } else {
      status = 'new';
      selected = true;
      reviewReason = 'New product to add to catalog';
    }

    // Infer category
    let category: ProductCategory = existing?.category || 'hardware';
    const descLower = firstRow.item_description.toLowerCase();
    if (/pipe|coupling|elbow|valve|drain|tap|basin|sink|bath|shower|pvc|copper/i.test(descLower)) {
      category = 'plumbing';
    } else if (/wire|cable|switch|socket|breaker|conduit|light|bulb/i.test(descLower)) {
      category = 'electrical';
    } else if (/cement|brick|timber|sand|paint|roof|dpc|door/i.test(descLower)) {
      category = 'building';
    }

    proposals.push({
      id: generateUniqueId('plp'),
      item_description: firstRow.item_description,
      standardized_name: std,
      proposed_unit_price: firstRow.unit_price,
      unit: existing?.unit || firstRow.unit || 'pcs',
      category,
      existing_item: existing,
      is_new: !existing,
      is_conflict: hasConflict,
      conflict_prices: hasConflict ? pricesArray : undefined,
      status,
      selected,
      review_reason: reviewReason,
    });
  });

  return proposals;
}

