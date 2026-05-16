// src/lib/valuation.ts

import type { MarketValuation } from './fordonlista-client';

export type Skick = 'som_ny' | 'mycket_bra' | 'bra' | 'sliten';

export interface ValuationInput {
  brand: string;          // e.g. "Volvo"
  year: number;           // e.g. 2018
  miltalMil: number;      // mil (1 mil = 10 km)
  fuel: 'petrol' | 'diesel' | 'hybrid' | 'electric';
  gearbox: 'manual' | 'automatic';
  skick: Skick;
}

export interface ValuationResult {
  estimate: number;
  rangeLow: number;
  rangeHigh: number;
  tradeIn: number;
  privateSale: number;
  bgnBud: number;
}

const BASE_PRICES: Record<string, number> = {
  Volvo: 265000,
  Volkswagen: 180000,
  Audi: 240000,
  BMW: 250000,
  'Mercedes-Benz': 260000,
  Toyota: 215000,
  Kia: 180000,
  Hyundai: 145000,
  Ford: 130000,
  Skoda: 160000,
  Peugeot: 120000,
  Renault: 115000,
  Nissan: 125000,
  Opel: 110000,
  Tesla: 350000,
};
const DEFAULT_BASE = 140000;

const FUEL_MULT: Record<ValuationInput['fuel'], number> = {
  petrol: 1.0,
  diesel: 1.05,
  hybrid: 1.15,
  electric: 1.25,
};

const GEARBOX_MULT: Record<ValuationInput['gearbox'], number> = {
  manual: 0.92,
  automatic: 1.0,
};

const SKICK_MULT: Record<Skick, number> = {
  som_ny: 1.10,
  mycket_bra: 1.0,
  bra: 0.92,
  sliten: 0.80,
};

export function calculateValuation(input: ValuationInput): ValuationResult {
  const basePrice = BASE_PRICES[input.brand] ?? DEFAULT_BASE;
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - input.year);

  let depreciation = 1;
  for (let i = 0; i < age; i++) {
    depreciation *= i === 0 ? 0.85 : 0.90;
  }

  const raw = basePrice * depreciation * FUEL_MULT[input.fuel] * GEARBOX_MULT[input.gearbox];

  // Miltal adjustment — capped at ±35% of `raw` to prevent extreme miltal
  // (e.g. 30 000 mil on a 5-year car) from driving the estimate negative.
  const expectedMileageMil = age * 1200;
  const mileageDiffMil = input.miltalMil - expectedMileageMil;
  const rawMileageAdj = -mileageDiffMil * 6;
  const maxPenalty = raw * 0.35;
  const maxBonus = raw * 0.15;
  const mileageAdjustment = Math.max(-maxPenalty, Math.min(maxBonus, rawMileageAdj));

  const estimate = Math.max(5000, Math.round((raw + mileageAdjustment) * SKICK_MULT[input.skick]));

  return {
    estimate,
    rangeLow: Math.round(estimate * 0.88),
    rangeHigh: Math.round(estimate * 1.12),
    tradeIn: Math.round(estimate * 0.85),
    privateSale: estimate,
    bgnBud: Math.round(estimate * 0.90),
  };
}

const SKICK_LABELS: Record<Skick, string> = {
  som_ny: 'Som ny',
  mycket_bra: 'Mycket bra',
  bra: 'Bra',
  sliten: 'Sliten',
};

export function skickLabel(s: Skick): string {
  return SKICK_LABELS[s];
}

// ─── Market-data variant ──────────────────────────────────────────────────
// Appended in fordonlista integration (2026-05-16). Used when the
// fordonlista API returns sufficient data; otherwise calculateValuation()
// (the static algorithm above) is used as fallback.

export interface MarketAdjustmentInput {
  market: MarketValuation;        // confidence must NOT be 'insufficient'
  miltalMil: number;
  skick: Skick;
}

const MILEAGE_PENALTY_KR_PER_MIL = 6;

export function calculateFromMarketData(input: MarketAdjustmentInput): ValuationResult {
  const { market, miltalMil, skick } = input;
  if (market.confidence === 'insufficient' || market.basePrice == null) {
    throw new Error('calculateFromMarketData called with insufficient data');
  }

  const expectedMileage = market.avgMileage ?? 13000;
  const mileageDiff = miltalMil - expectedMileage;
  const rawMileageAdj = -mileageDiff * MILEAGE_PENALTY_KR_PER_MIL;
  // Cap the adjustment at ±35% / 15% of basePrice so extreme miltal can't
  // drive the estimate to the 5 000 kr floor.
  const maxPenalty = market.basePrice * 0.35;
  const maxBonus = market.basePrice * 0.15;
  const mileageAdjustment = Math.max(-maxPenalty, Math.min(maxBonus, rawMileageAdj));

  const skickMultiplier = ({
    som_ny: 1.10,
    mycket_bra: 1.00,
    bra: 0.92,
    sliten: 0.80,
  } as const)[skick];

  const estimate = Math.max(
    5000,
    Math.round((market.basePrice + mileageAdjustment) * skickMultiplier),
  );

  return {
    estimate,
    rangeLow: Math.round(estimate * 0.88),
    rangeHigh: Math.round(estimate * 1.12),
    tradeIn: Math.round(estimate * 0.85),
    privateSale: estimate,
    bgnBud: Math.round(estimate * 0.90),
  };
}
