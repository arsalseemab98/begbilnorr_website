// src/lib/biluppgifter.ts
//
// Wraps biluppgifter.se vehicle lookup.
//
// API verified against working impl in begbilnorr admin app (Supabase Edge
// Function `biluppgifter-proxy` + `CarInspectionForm.tsx`):
//   - Base URL: https://data.biluppgifter.se/api/v1
//   - Endpoint: /vehicle/regno/{regnr}
//   - Auth:     Authorization: Bearer ${BILUPPGIFTER_API_KEY}
//   - Response: { vehicle: { make, model, model_year, transmission,
//                  technical: { drive: [{ fuel }] }, ... } }

export interface VehicleData {
  brand: string;          // e.g. "Volvo"
  model: string;          // e.g. "V70"
  year: number;           // e.g. 2018
  fuel: 'petrol' | 'diesel' | 'hybrid' | 'electric';
  gearbox: 'manual' | 'automatic';
  co2: number | null;     // g/km, null if unknown
  weight: number | null;  // tjänstevikt kg, null if unknown
}

export class BiluppgifterError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'BiluppgifterError';
  }
}

const BASE_URL = 'https://data.biluppgifter.se/api/v1';

function normaliseRegnr(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

function mapFuelFromTechnical(technical: any): VehicleData['fuel'] {
  // Hybrid detection: multiple drive entries OR explicit hybrid class
  const drives: any[] = Array.isArray(technical?.drive) ? technical.drive : [];
  const ecoClass = (technical?.eco_class ?? '').toLowerCase();
  const evConfig = (technical?.electric_vehicle_configuration ?? '').toLowerCase();
  const emissionClass = (technical?.emission_class ?? '').toLowerCase();

  if (ecoClass.includes('hybrid') || evConfig.includes('hybrid') || emissionClass.includes('hybrid')) {
    return 'hybrid';
  }
  if (drives.length > 1) {
    // Multiple drives (e.g. Bensin + El) almost always means hybrid in Swedish data
    return 'hybrid';
  }

  const primary = (drives[0]?.fuel ?? '').toLowerCase();
  if (primary === 'el' || primary.includes('elektri')) return 'electric';
  if (primary.includes('diesel')) return 'diesel';
  return 'petrol';
}

function mapGearbox(raw: string | undefined | null): VehicleData['gearbox'] {
  // Default to automatic — only explicit "manuell" maps to manual.
  // Covers: Variomatic (CVT), Automat, Automatisk, DSG, S-tronic, etc.
  const v = (raw ?? '').toLowerCase();
  if (v.includes('manuell') || v.includes('manual')) return 'manual';
  return 'automatic';
}

export async function getVehicleByRegnr(regnr: string): Promise<VehicleData> {
  // Read from both import.meta.env (build-time) and process.env (runtime fallback).
  // Vercel serverless functions reliably expose env vars via process.env.
  const apiKey =
    import.meta.env.BILUPPGIFTER_API_KEY ??
    (typeof process !== 'undefined' ? process.env.BILUPPGIFTER_API_KEY : undefined);
  if (!apiKey) {
    throw new BiluppgifterError('BILUPPGIFTER_API_KEY missing in env');
  }

  const reg = normaliseRegnr(regnr);
  const url = `${BASE_URL}/vehicle/regno/${encodeURIComponent(reg)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'Begbilnorr-Website/1.0',
    },
  });

  if (!res.ok) {
    throw new BiluppgifterError(`biluppgifter returned ${res.status}`, res.status);
  }

  const data: any = await res.json();
  const v = data?.vehicle;

  if (!v || !v.make) {
    throw new BiluppgifterError('Unexpected response shape from biluppgifter (no vehicle.make)');
  }

  const year = Number(v.model_year ?? v.vehicle_year ?? v.year ?? 0) || new Date().getFullYear();
  const co2 = v.technical?.drive?.[0]?.co2 ?? v.technical?.environment?.co2 ?? v.co2;
  const weight = v.technical?.kerb_weight ?? v.technical?.ready_weight ?? v.weight;

  return {
    brand: String(v.make).trim(),
    model: String(v.model ?? '').trim(),
    year,
    fuel: mapFuelFromTechnical(v.technical),
    gearbox: mapGearbox(v.transmission),
    co2: co2 != null ? Number(co2) : null,
    weight: weight != null ? Number(weight) : null,
  };
}
