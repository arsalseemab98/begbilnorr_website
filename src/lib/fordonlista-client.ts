// src/lib/fordonlista-client.ts
//
// Wrapper around the fordonlista valuation API.
// Returns null (not throw) on any failure — callers fall back to static algo.

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface MarketValuation {
  basePrice?: number;
  sampleSize: number;
  confidence: Confidence;
  priceRange?: [number, number];
  avgMileage?: number;
  matchedYears?: number[];
  sourceMix?: { private: number; dealer_adjusted: number };
}

export async function fetchMarketValuation(
  marke: string,
  modell: string,
  arsmodell: number,
): Promise<MarketValuation | null> {
  const url =
    import.meta.env.FORDONLISTA_VALUATION_URL ??
    process.env.FORDONLISTA_VALUATION_URL;
  const key =
    import.meta.env.FORDONLISTA_VALUATION_KEY ??
    (typeof process !== 'undefined' ? process.env.FORDONLISTA_VALUATION_KEY : undefined);

  if (!url || !key) {
    console.warn('fordonlista env vars missing; skipping market lookup');
    return null;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
      },
      body: JSON.stringify({ marke, modell, arsmodell }),
      // Timeout via AbortSignal — don't block /api/vardera if fordonlista is slow
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn('fordonlista API returned', res.status);
      return null;
    }
    const data = (await res.json()) as MarketValuation;
    return data;
  } catch (err) {
    console.warn('fordonlista API call failed:', err);
    return null;
  }
}
