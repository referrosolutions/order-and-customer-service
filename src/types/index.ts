import { USER_TYPE } from 'src/core/enums';
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
