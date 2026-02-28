export interface Car {
  id: string;
  created_at: string;
  updated_at: string;
  reg_no: string;
  slug: string;
  brand: string;
  model: string;
  variant?: string;
  full_name: string;
  year: number;
  mileage: number;
  fuel_type: string;
  gearbox: string;
  body_type?: string;
  price: number;
  monthly_payment?: string;
  description?: string;
  specifications?: string;
  equipment: string[];
  images: string[];
  is_active: boolean;
  is_sold: boolean;
}
