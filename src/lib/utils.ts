export function generateSlug(brand: string, model: string, variant: string | undefined, year: number, regNo: string): string {
  const parts = [brand, model, variant, String(year), regNo]
    .filter(Boolean)
    .map((p) => (p as string).toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, ''));
  return parts.join('-');
}

export function formatPrice(price: number): string {
  return price.toLocaleString('sv-SE') + ' kr';
}

export function calculateMonthlyPayment(price: number, downPaymentPercent = 20, months = 72, annualRate = 0.0895): string {
  const downPayment = price * (downPaymentPercent / 100);
  const principal = price - downPayment;
  if (principal <= 0) return '0 kr/mån';
  const monthlyRate = annualRate / 12;
  const monthly = monthlyRate > 0
    ? (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
    : principal / months;
  const rounded = Math.round(monthly);
  return rounded.toLocaleString('sv-SE') + ' kr/mån';
}

export function formatMileage(mileage: number): string {
  return mileage.toLocaleString('sv-SE') + ' mil';
}
