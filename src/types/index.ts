import { COMMISSION_STATUS, ORDER_STATUS, PAYMENT_METHOD, USER_TYPE } from 'src/core/enums';
import { Order } from 'src/entity/order.entity';

export interface JwtPayload {
  id: string;
  name: string;
  phone_number: string;
  user_type: USER_TYPE;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CustomerOrderHistoryResponse {
  customerId: string;
  totalOrders: number;
  totalSpent: number;
  orders: Order[];
}

export interface OrderItemCreatorView {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  product_image: string;
  variant_label: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vendor_id: string;
  vendor_name: string | null;
  commission_amount: number | null;
  commission_status: COMMISSION_STATUS | null;
}

export interface OrderCreatorView {
  id: string;
  status: ORDER_STATUS;
  created_at: Date;
  updated_at: Date;
  items: OrderItemCreatorView[];
  total_commission: number | null;
}

export interface OrderItemVendorView {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  product_image: string;
  variant_label: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vendor_net: number | null;
  commission_amount: number | null;
}

export interface OrderVendorView {
  id: string;
  status: ORDER_STATUS;
  created_at: Date;
  updated_at: Date;
  payment_method: PAYMENT_METHOD;
  ispaid: boolean;
  creator_id: string | null;
  creator_name: string | null;
  items: OrderItemVendorView[];
  vendor_subtotal: number;
  vendor_net_total: number | null;
}

export interface OrderItemCommissionView {
  commission_amount: number;
  commission_percent: number;
  platform_fee: number;
  vendor_net: number;
  status: COMMISSION_STATUS;
  available_at: Date | null;
}

export interface OrderItemAdminView {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  product_image: string;
  variant_label: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vendor_id: string;
  vendor_name: string | null;
  creator_id: string | null;
  affiliate_id: string | null;
  commission: OrderItemCommissionView | null;
}

export interface OrderAdminCustomer {
  id: string;
  name: string;
  phone_number: string;
  email: string | null;
  user_id: string | null;
}

export interface OrderAdminDelivery {
  id: string;
  tracking_number: string | null;
  tracking_url: string | null;
  delivery_method: string | null;
  status: string;
  delivery_charge: number;
}

export interface OrderAdminFinancialSummary {
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  grand_total: number;
  total_commission: number;
  total_platform_fees: number;
  total_vendor_net: number;
}

export interface OrderAdminView {
  id: string;
  status: ORDER_STATUS;
  payment_method: PAYMENT_METHOD;
  ispaid: boolean;
  shipping_address: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
  created_at: Date;
  updated_at: Date;
  customer: OrderAdminCustomer;
  creator_id: string | null;
  creator_name: string | null;
  items: OrderItemAdminView[];
  delivery: OrderAdminDelivery | null;
  financial_summary: OrderAdminFinancialSummary;
}

export interface AdminOrderStats {
  total_orders: number;
  total_revenue: number;
  pending_orders: number;
  paid_orders: number;
  shipped_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  total_commission: number;
  total_platform_fees: number;
}
