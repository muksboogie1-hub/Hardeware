/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Quotation Text Parser & Intelligent Price Matcher
 * Parses raw text input into clean line items with units and descriptions.
 * Handles hardware specifications without mistaking dimensions for quantities.
 */

import { PriceItem, QuotationLineItem } from '../types';
import { multMoney } from './math';

export interface ParsedRawLine {
  quantity: number;
  unit: string;
  description: string;
  raw: string;
}

const COMMON_UNITS = [
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

/**
 * Standardizes a product name for fuzzy comparison:
 * Lowercases, strips punctuation, normalizes spacing, removes plural 's' at word ends.
 */
export function standardizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      // standardise common units and plural forms
      if (word.length > 3 && word.endsWith('s')) {
        return word.slice(0, -1);
      }
      return word;
    })
    .sort() // token-sort for matching "19mm pvc pipe" with "pvc pipe 19mm"
    .join(' ');
}

/**
 * Parses a single line of raw quotation text
 */
export function parseQuotationLine(line: string): ParsedRawLine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null;
  }

  // Pattern 1: Leading quantity followed by "x" or "*", e.g. "2 x PVC pipes 19mm" or "100*Coupling"
  const patternX = /^(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(.+)$/i;
  const matchX = trimmed.match(patternX);
  if (matchX) {
    const qty = parseFloat(matchX[1]);
    const remainder = matchX[2].trim();

    // Check if remainder starts with a recognized unit, e.g. "lengths timber 2x4"
    const words = remainder.split(/\s+/);
    if (words.length > 1 && COMMON_UNITS.includes(words[0].toLowerCase())) {
      return {
        quantity: qty,
        unit: words[0],
        description: words.slice(1).join(' '),
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

  // Pattern 2: Leading quantity followed by recognized unit, e.g. "8 lengths timber 2x4", "2 rolls DPC membrane"
  const unitRegex = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s+(${COMMON_UNITS.join('|')})\\b(?:\\s+(?:of\\s+)?(.+))?$`, 'i');
  const matchUnit = trimmed.match(unitRegex);
  if (matchUnit) {
    return {
      quantity: parseFloat(matchUnit[1]),
      unit: matchUnit[2],
      description: (matchUnit[3] || '').trim(),
      raw: trimmed,
    };
  }

  // Pattern 3: Leading number followed directly by description, e.g. "12 Round boxes"
  // BUT BE CAREFUL: "19mm PVC pipe" has "19mm", not a standalone quantity!
  // If the leading number has attached units like mm, cm, m, inch, kg, V, W, then it's a spec!
  const patternNum = /^(\d+(?:\.\d+)?)\s+([a-zA-Z].*)$/;
  const matchNum = trimmed.match(patternNum);
  if (matchNum) {
    const numPart = matchNum[1];
    const rest = matchNum[2].trim();

    // Check if first word of rest is a measurement unit like "mm", "inch", "gauge"
    const firstWord = rest.split(/\s+/)[0].toLowerCase();
    const measurementSuffixes = ['mm', 'cm', 'in', 'inch', 'inches', 'gauge', 'kg', 'g', 'v', 'w', 'amp', 'amps', 'bar', 'm'];
    if (measurementSuffixes.includes(firstWord)) {
      // e.g. "19 mm PVC pipe" -> quantity is default 1, full description is the text
      return {
        quantity: 1,
        unit: 'pcs',
        description: trimmed,
        raw: trimmed,
      };
    }

    return {
      quantity: parseFloat(numPart),
      unit: 'pcs',
      description: rest,
      raw: trimmed,
    };
  }

  // Default: Entire line is item description with quantity 1
  return {
    quantity: 1,
    unit: 'pcs',
    description: trimmed,
    raw: trimmed,
  };
}

/**
 * Searches the price library for the best match for a given description
 */
export function findMatchingPriceItem(
  description: string,
  priceLibrary: PriceItem[]
): PriceItem | null {
  if (!description || !priceLibrary || priceLibrary.length === 0) return null;

  const targetStd = standardizeProductName(description);
  const targetWords = targetStd.split(' ').filter(Boolean);

  // Exact standardized match
  const exact = priceLibrary.find((item) => item.standardized_name === targetStd);
  if (exact) return exact;

  // Normalized literal match (case-insensitive)
  const literalMatch = priceLibrary.find(
    (item) => item.product_name.toLowerCase().trim() === description.toLowerCase().trim()
  );
  if (literalMatch) return literalMatch;

  // Word token containment match: all target words exist in library item or vice versa
  for (const item of priceLibrary) {
    const itemWords = item.standardized_name.split(' ').filter(Boolean);
    if (targetWords.length >= 2 && itemWords.length >= 2) {
      const allTargetInItem = targetWords.every((w) => itemWords.includes(w));
      const allItemInTarget = itemWords.every((w) => targetWords.includes(w));
      if (allTargetInItem || allItemInTarget) {
        return item;
      }
    }
  }

  return null;
}

/**
 * Parses raw text into QuotationLineItems, resolving known prices from Price Library
 */
export function parseRawQuotationText(
  rawText: string,
  priceLibrary: PriceItem[]
): QuotationLineItem[] {
  const lines = rawText.split(/\r?\n/);
  const items: QuotationLineItem[] = [];

  for (const line of lines) {
    const parsed = parseQuotationLine(line);
    if (!parsed || !parsed.description) continue;

    const matchedItem = findMatchingPriceItem(parsed.description, priceLibrary);
    const unitPrice = matchedItem ? matchedItem.current_unit_price : 0;
    const unit = matchedItem?.unit || parsed.unit || 'pcs';
    const lineTotal = multMoney(unitPrice, parsed.quantity);

    items.push({
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      raw_input: parsed.raw,
      item_description: parsed.description,
      quantity: parsed.quantity,
      unit: unit,
      unit_price: unitPrice,
      line_total: lineTotal,
      matched_from_library: !!matchedItem,
    });
  }

  return items;
}
