export function generateSlug(brand: string, model: string, variant: string | undefined, year: number, regNo: string): string {
  const parts = [brand, model, variant, String(year), regNo]
    .filter(Boolean)
    .map((p) => (p as string).toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, ''));
  return parts.join('-');
}

export function formatPrice(price: number): string {
  return price.toLocaleString('sv-SE') + ' kr';
}

export function calculateMonthlyPayment(price: number): string {
  if (price <= 50000) return '1 000 kr/mån';
  if (price <= 100000) return '1 500 kr/mån';
  if (price <= 150000) return '2 000 kr/mån';
  if (price <= 200000) return '2 500 kr/mån';
  if (price <= 300000) return '3 000 kr/mån';
  return '4 000 kr/mån';
}

export function formatMileage(mileage: number): string {
  return mileage.toLocaleString('sv-SE') + ' mil';
}
