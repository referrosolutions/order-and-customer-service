export enum USER_TYPE {
  ADMIN = 'admin',
  VENDOR = 'vendor',
  CREATOR = 'creator',
}

export enum ORDER_STATUS {
  PENDING = 'pending',
  PAID = 'paid',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum PAYMENT_METHOD {
  WALLET_QR = 'wallet_qr',
  COD = 'cod',
}

export enum DELIVERY_PROVIDER {
  PATHAO = 'pathao',
  KALPA = 'kalpa',
}

export enum DELIVERY_STATUS {
  PENDING = 'pending',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
}

export enum COMMISSION_STATUS {
  PENDING = 'pending',
  IN_ESCROW = 'in_escrow',
  AVAILABLE = 'available',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  FROZEN = 'frozen',
}

// Valid order status transitions (state machine)
export const ORDER_STATUS_TRANSITIONS: Record<ORDER_STATUS, ORDER_STATUS[]> = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.PAID, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PAID]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [], // Terminal state
  [ORDER_STATUS.CANCELLED]: [], // Terminal state
};
