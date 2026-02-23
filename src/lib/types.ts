export type AppRole = "admin" | "client";
export type AccountStatus = "pending" | "approved" | "rejected";

export type ProductType = "GY" | "NS";

export type Product = {
  id: string;
  gsm: number;
  bf: number;
  inch: number;
  type: ProductType;
  available_reels: number;
  stock: number;
  price: number;
  discount: number;
  is_active: boolean;
  low_stock_threshold: number;
  image_url: string | null;
  created_at: string;
};

export type OrderStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "partial"
  | "approved"
  | "partially_accepted";

export type Order = {
  id: string;
  user_id: string;
  gsm: number;
  bf: number;
  inch: number;
  quantity: number;
  status: OrderStatus;
  created_at: string;
};

export type OrderItemStatus = "pending" | "accepted" | "rejected" | "approved" | "partially_accepted";

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity_requested: number;
  quantity_approved: number;
  status: OrderItemStatus;
  item_status: "pending" | "accepted" | "rejected";
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  name: string | null;
  email: string;
  firm_name: string;
  proprietor_name: string;
  full_name: string;
  gst_number: string | null;
  firm_address: string;
  phone1: string;
  phone2: string | null;
  email2: string | null;
  role: AppRole;
  status: AccountStatus;
  approval_status: AccountStatus;
  created_at: string;
};
