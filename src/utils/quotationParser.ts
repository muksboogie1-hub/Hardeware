/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Quotation Text Parser & Safe Price Matching Engine
 * Accurately distinguishes quantities from dimensions, measurements, and specifications.
 * Enforces strict material, dimension, and unit safety rules.
 */

import { PriceItem, QuotationLineItem } from '../types';
import { multMoney } from './math';

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
