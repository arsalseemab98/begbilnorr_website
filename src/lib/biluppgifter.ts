// src/lib/biluppgifter.ts
//
// Wraps biluppgifter.se vehicle lookup.
//
// Required env var: BILUPPGIFTER_API_KEY
//
// If the endpoint URL or auth scheme differs from what's below, update only
// this file — callers use the typed return value and don't care.

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

const BASE_URL = 'https://api.biluppgifter.se/v1';

function normaliseRegnr(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

function mapFuel(raw: string | undefined): VehicleData['fuel'] {
  const v = (raw ?? '').toLowerCase();
  if (v.includes('el') && !v.includes('hybrid')) return 'electric';
  if (v.includes('hybrid')) return 'hybrid';
  if (v.includes('diesel')) return 'diesel';
  return 'petrol';
}

function mapGearbox(raw: string | undefined): VehicleData['gearbox'] {
  return (raw ?? '').toLowerCase().includes('automat') ? 'automatic' : 'manual';
}

export async function getVehicleByRegnr(regnr: string): Promise<VehicleData> {
  const apiKey = import.meta.env.BILUPPGIFTER_API_KEY;
  if (!apiKey) {
    throw new BiluppgifterError('BILUPPGIFTER_API_KEY missing in env');
  }

  const reg = normaliseRegnr(regnr);
  const url = `${BASE_URL}/vehicle/${encodeURIComponent(reg)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new BiluppgifterError(`biluppgifter returned ${res.status}`, res.status);
  }

  const data: any = await res.json();
  // Be defensive — biluppgifter's response shape may vary by plan.
  const v = data.vehicle ?? data.data ?? data;

  if (!v.brand && !v.make) {
    throw new BiluppgifterError('Unexpected response shape from biluppgifter');
  }

  return {
    brand: String(v.brand ?? v.make).trim(),
    model: String(v.model ?? '').trim(),
    year: Number(v.model_year ?? v.year ?? v.first_registration_year ?? 0) || new Date().getFullYear(),
    fuel: mapFuel(v.fuel ?? v.fuel_type),
    gearbox: mapGearbox(v.gearbox ?? v.transmission),
    co2: v.co2 != null ? Number(v.co2) : null,
    weight: v.weight ?? v.kerb_weight ?? v.service_weight ?? null,
  };
}
