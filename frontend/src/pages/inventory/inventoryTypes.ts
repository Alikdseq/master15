export type InventoryProduct = {
  id: number;
  name: string;
  category: number;
  category_name?: string;
  sku: string;
  unit: string;
  purchase_price: string | null;
  selling_price: string | null;
  min_stock: string;
  current_stock: string;
  is_low_stock: boolean;
  created_at?: string;
  updated_at?: string;
};

export type InventoryCategoryRow = {
  id: number;
  name: string;
  parent: number | null;
  product_count?: number;
};

export type StockMovementRow = {
  id: number;
  product: number;
  product_name?: string;
  product_sku?: string;
  type: string;
  quantity: string;
  reason: string;
  comment: string;
  order: number | null;
  order_number: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
};

export type UsedInOrderRow = {
  order_id: number;
  order_number: string;
  quantity: string;
};

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
