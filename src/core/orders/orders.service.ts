import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DELIVERY_STATUS, ORDER_STATUS, ORDER_STATUS_TRANSITIONS, PAYMENT_METHOD, USER_TYPE } from 'src/core/enums';
import { OrderItem } from 'src/entity/order-item.entity';
import { Order } from 'src/entity/order.entity';
import { Delivery } from 'src/entity/delivery.entity';
import { CommissionRecord } from 'src/entity/commission-record.entity';
import { AdminOrderStats, JwtPayload, OrderAdminView, OrderCreatorView, OrderItemAdminView, OrderItemCreatorView, OrderItemVendorView, OrderVendorView, PaginatedResponse } from 'src/types';
import { AuthClient } from 'src/utils/auth.client';
import { handleServiceError } from 'src/utils/error';
import { NotificationClient } from 'src/utils/notification.client';
import { DataSource, Repository } from 'typeorm';
import { CustomersService } from '../customers/customers.service';
import { DeliveryService } from '../deliveries/delivery.service';
import { CommissionsService } from '../commissions/commissions.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

export interface VendorAnalytics {
  total_orders: number;
  total_revenue: number;
  pending_orders: number;
  paid_orders: number;
  shipped_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    private readonly dataSource: DataSource,
    private readonly customersService: CustomersService,
    private readonly notificationClient: NotificationClient,
    private readonly deliveryService: DeliveryService,
    private readonly commissionsService: CommissionsService,
    private readonly authClient: AuthClient,
  ) {}

  private notifyOrderCreated(
    order: Order,
    customerUserId: string | null | undefined,
    creatorId: string | null,
    productNames: string[],
  ): void {
    const ref = order.id.slice(0, 8).toUpperCase()
    const amount = order.grand_total

    const uniqueVendorIds = [...new Set(order.items.map((i) => i.vendor_id))]
    uniqueVendorIds.forEach((vendorId) => {
      this.notificationClient
        .send({
          userId: vendorId,
          id: `order-created-${order.id}-${vendorId}`,
          title: 'New Order Received',
          message: `New order #${ref} worth Rs ${amount} awaits fulfillment.`,
          link: '/dashboard/my-orders',
          source: 'order-service',
        })
        .catch((err: Error) => this.logger.warn(`Notification failed: ${err.message}`))
    })

    if (creatorId) {
      const productLabel =
        productNames.length === 1
          ? `"${productNames[0]}"`
          : productNames.length === 2
            ? `"${productNames[0]}" and "${productNames[1]}"`
            : productNames.length > 2
              ? `"${productNames[0]}" and ${productNames.length - 1} more items`
              : 'items'
      this.notificationClient
        .send({
          userId: creatorId,
          id: `order-created-creator-${order.id}`,
          title: 'New Order via Your Link',
          message: `Someone ordered ${productLabel} via your affiliate link — order #${ref} worth Rs ${amount}.`,
          link: '/dashboard/my-orders',
          source: 'order-service',
        })
        .catch((err: Error) => this.logger.warn(`Notification failed: ${err.message}`))
    }

    if (customerUserId) {
      this.notificationClient
        .send({
          userId: customerUserId,
          id: `order-created-customer-${order.id}`,
          title: 'Order Confirmed',
          message: `Your order #${ref} has been placed. Total: Rs ${amount}.`,
          link: '/dashboard/my-orders',
          source: 'order-service',
        })
        .catch((err: Error) => this.logger.warn(`Notification failed: ${err.message}`))
    }
  }

  private async resolveAffiliate(sessionId: string, orderId: string): Promise<{
    storeId: string | null;
    creatorId: string | null;
    affiliateId: string | null;
  }> {
    const affiliateServiceUrl = process.env.AFFILIATE_SERVICE_URL || 'http://localhost:9003';
    try {
      const res = await fetch(`${affiliateServiceUrl}/api/v1/tracking/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, order_id: orderId }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          creator_id?: string;
          affiliate_id?: string;
          store_id?: string;
        } | null;
        if (data) {
          return {
            storeId: data.store_id ?? null,
            creatorId: data.creator_id ?? null,
            affiliateId: data.affiliate_id ?? null,
          };
        }
      }
    } catch (err) {
      this.logger.warn(
        `Affiliate attribution failed (order still created): ${(err as Error).message}`,
      );
    }
    return { storeId: null, creatorId: null, affiliateId: null };
  }

  private async saveOrderWithItems(
    customerId: string,
    items: CreateOrderDto['items'],
    paymentMethod: CreateOrderDto['payment_method'],
    subtotal: number,
    deliveryFee: number,
    discountAmount: number,
    grandTotal: number,
    shippingAddress: CreateOrderDto['shipping_address'] | null,
    storeId: string | null,
    creatorId: string | null,
    affiliateId: string | null,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const newOrder = manager.create(Order, {
        customer_id: customerId,
        payment_method: paymentMethod,
        subtotal,
        delivery_fee: deliveryFee,
        discount_amount: discountAmount,
        grand_total: grandTotal,
        ispaid: false,
        status: ORDER_STATUS.PENDING,
        store_id: storeId,
        creator_id: creatorId,
        shipping_address: shippingAddress ?? null,
      });
      const savedOrder = await manager.save(newOrder);

      const orderItems = items.map((item) =>
        manager.create(OrderItem, {
          order_id: savedOrder.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          affiliate_id: affiliateId,
          vendor_id: item.vendor_id,
          creator_id: creatorId,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.quantity,
          product_name: item.product_name ?? '',
          product_image: item.product_image ?? '',
          variant_label: item.variant_label ?? '',
        }),
      );
      await manager.save(orderItems);

      return manager.findOne(Order, {
        where: { id: savedOrder.id },
        relations: ['items'],
      }) as Promise<Order>;
    });
  }

  async create(dto: CreateOrderDto, user: JwtPayload, sessionId?: string): Promise<Order> {
    try {
      const customer = await this.customersService.findOrCreate({
        phoneNumber: user.phone_number,
        name: user.name,
        userId: user.id,
        address: dto.shipping_address ?? {},
      });

      const subtotal = dto.items.reduce(
        (sum, item) => sum + item.unit_price * item.quantity,
        0,
      );
      const deliveryFee = dto.delivery_fee ?? 0;
      const discountAmount = dto.discount_amount ?? 0;
      const grandTotal = subtotal + deliveryFee - discountAmount;

      const order = await this.saveOrderWithItems(
        customer.id,
        dto.items,
        dto.payment_method,
        subtotal,
        deliveryFee,
        discountAmount,
        grandTotal,
        dto.shipping_address ?? null,
        null,
        null,
        null,
      );

      if (sessionId) {
        const { storeId, creatorId, affiliateId } = await this.resolveAffiliate(sessionId, order.id);
        if (creatorId) {
          await this.orderRepo.update(order.id, { creator_id: creatorId, store_id: storeId });
          await this.orderItemRepo.update({ order_id: order.id }, { creator_id: creatorId, affiliate_id: affiliateId });
          order.creator_id = creatorId;
          order.store_id = storeId;
        }
      }

      const productNames = dto.items.map((i) => i.product_name ?? '').filter(Boolean)
      this.notifyOrderCreated(order, customer.userId, order.creator_id, productNames)
      return order
    } catch (error) {
      handleServiceError(error, 'Failed to create order', 'OrdersService');
    }
  }

  async createGuest(dto: CreateGuestOrderDto, sessionId?: string): Promise<Order> {
    try {
      const customer = await this.customersService.findOrCreate({
        phoneNumber: dto.customer.phone_number,
        name: dto.customer.name,
        email: dto.customer.email,
        address: dto.customer.address,
      });

      const subtotal = dto.items.reduce(
        (sum, item) => sum + item.unit_price * item.quantity,
        0,
      );
      const deliveryFee = dto.delivery_fee ?? 0;
      const discountAmount = dto.discount_amount ?? 0;
      const grandTotal = subtotal + deliveryFee - discountAmount;

      const order = await this.saveOrderWithItems(
        customer.id,
        dto.items,
        dto.payment_method,
        subtotal,
        deliveryFee,
        discountAmount,
        grandTotal,
        dto.customer.address ?? null,
        null,
        null,
        null,
      );

      if (sessionId) {
        const { storeId, creatorId, affiliateId } = await this.resolveAffiliate(sessionId, order.id);
        if (creatorId) {
          await this.orderRepo.update(order.id, { creator_id: creatorId, store_id: storeId });
          await this.orderItemRepo.update({ order_id: order.id }, { creator_id: creatorId, affiliate_id: affiliateId });
          order.creator_id = creatorId;
          order.store_id = storeId;
        }
      }

      const productNames = dto.items.map((i) => i.product_name ?? '').filter(Boolean)
      this.notifyOrderCreated(order, customer.userId, order.creator_id, productNames)
      return order
    } catch (error) {
      handleServiceError(error, 'Failed to create guest order', 'OrdersService');
    }
  }

  async findAll(query: OrderQueryDto): Promise<PaginatedResponse<Order>> {
    try {
      const { page = 1, limit = 20, status, customer_id, creator_id } = query;
      const skip = (page - 1) * limit;

      const queryBuilder = this.orderRepo
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.items', 'items')
        .orderBy('order.created_at', 'DESC')
        .skip(skip)
        .take(limit);

      if (status) {
        queryBuilder.andWhere('order.status = :status', { status });
      }
      if (customer_id) {
        queryBuilder.andWhere('order.customer_id = :customer_id', { customer_id });
      }
      if (creator_id) {
        queryBuilder.andWhere('order.creator_id = :creator_id', { creator_id });
      }

      const [data, total] = await queryBuilder.getManyAndCount();

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      handleServiceError(error, 'Failed to fetch orders', 'OrdersService');
    }
  }

  async findOne(id: string): Promise<Order & { delivery: Delivery | null }> {
    try {
      const order = await this.orderRepo.findOne({
        where: { id },
        relations: ['items', 'customer'],
      });

      if (!order) {
        throw new NotFoundException(`Order with ID ${id} not found`);
      }

      let delivery: Delivery | null = null;
      try {
        delivery = await this.deliveryService.findByOrderId(id);
      } catch {
        // delivery not yet created — this is expected before SHIPPED
      }

      return Object.assign(order, { delivery });
    } catch (error) {
      handleServiceError(error, 'Failed to fetch order', 'OrdersService');
    }
  }

  async findByCustomer(
    customerId: string,
    query: OrderQueryDto,
  ): Promise<PaginatedResponse<Order>> {
    return this.findAll({ ...query, customer_id: customerId });
  }

  private buildCreatorOrderView(
    order: Order,
    commissionMap: Map<string, CommissionRecord>,
    vendorNameMap: Record<string, string>,
  ): OrderCreatorView {
    const items: OrderItemCreatorView[] = order.items.map((item) => {
      const commission = commissionMap.get(item.id);
      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        product_image: item.product_image,
        variant_label: item.variant_label,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total_price: Number(item.total_price),
        vendor_id: item.vendor_id,
        vendor_name: vendorNameMap[item.vendor_id] ?? null,
        commission_amount: commission ? Number(commission.commission_amount) : null,
        commission_status: commission ? commission.status : null,
      };
    });

    const hasCommission = items.some((i) => i.commission_amount !== null);
    const total_commission = hasCommission
      ? items.reduce((sum, i) => sum + (i.commission_amount ?? 0), 0)
      : null;

    return { id: order.id, status: order.status, created_at: order.created_at, updated_at: order.updated_at, items, total_commission };
  }

  private buildVendorOrderView(
    order: Order,
    commissionMap: Map<string, CommissionRecord>,
    vendorId: string,
    creatorName: string | null,
  ): OrderVendorView {
    const vendorItems = order.items.filter((i) => i.vendor_id === vendorId);
    const items: OrderItemVendorView[] = vendorItems.map((item) => {
      const commission = commissionMap.get(item.id);
      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        product_image: item.product_image,
        variant_label: item.variant_label,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total_price: Number(item.total_price),
        vendor_net: commission ? Number(commission.vendor_net) : null,
        commission_amount: commission ? Number(commission.commission_amount) : null,
      };
    });

    const vendor_subtotal = items.reduce((sum, i) => sum + i.total_price, 0);
    const hasNet = items.some((i) => i.vendor_net !== null);
    const vendor_net_total = hasNet ? items.reduce((sum, i) => sum + (i.vendor_net ?? i.total_price), 0) : null;

    return {
      id: order.id,
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at,
      payment_method: order.payment_method,
      ispaid: order.ispaid,
      creator_id: order.creator_id,
      creator_name: creatorName,
      items,
      vendor_subtotal,
      vendor_net_total,
    };
  }

  private buildAdminItemView(
    item: OrderItem,
    commissionMap: Map<string, CommissionRecord>,
    vendorNameMap: Record<string, string>,
  ): OrderItemAdminView {
    const commission = commissionMap.get(item.id);
    return {
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      product_image: item.product_image,
      variant_label: item.variant_label,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      total_price: Number(item.total_price),
      vendor_id: item.vendor_id,
      vendor_name: vendorNameMap[item.vendor_id] ?? null,
      creator_id: item.creator_id,
      affiliate_id: item.affiliate_id,
      commission: commission
        ? {
            commission_amount: Number(commission.commission_amount),
            commission_percent: Number(commission.commission_percent),
            platform_fee: Number(commission.platform_fee),
            vendor_net: Number(commission.vendor_net),
            status: commission.status,
            available_at: commission.available_at,
          }
        : null,
    };
  }

  private async buildAdminOrderView(id: string): Promise<OrderAdminView> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['items', 'customer'],
    });

    if (!order) throw new NotFoundException(`Order with ID ${id} not found`);

    let delivery: Delivery | null = null;
    try {
      delivery = await this.deliveryService.findByOrderId(id);
    } catch {
      // delivery not yet created — expected before SHIPPED
    }

    const allItemIds = order.items.map((i) => i.id);
    const commissions = await this.commissionsService.getByOrderItemIds(allItemIds);
    const commissionMap = new Map(commissions.map((c) => [c.order_item_id, c]));

    const uniqueVendorIds = [...new Set(order.items.map((i) => i.vendor_id))];
    const vendorNameMap = await this.authClient.getVendorNames(uniqueVendorIds);

    const creatorName = order.creator_id
      ? (await this.authClient.getCreatorNames([order.creator_id]))[order.creator_id] ?? null
      : null;

    const items: OrderItemAdminView[] = order.items.map((item) =>
      this.buildAdminItemView(item, commissionMap, vendorNameMap),
    );

    const total_commission = items.reduce((sum, i) => sum + (i.commission?.commission_amount ?? 0), 0);
    const total_platform_fees = items.reduce((sum, i) => sum + (i.commission?.platform_fee ?? 0), 0);
    const total_vendor_net = items.reduce((sum, i) => sum + (i.commission?.vendor_net ?? 0), 0);

    return {
      id: order.id,
      status: order.status,
      payment_method: order.payment_method,
      ispaid: order.ispaid,
      shipping_address: order.shipping_address,
      created_at: order.created_at,
      updated_at: order.updated_at,
      customer: {
        id: order.customer.id,
        name: order.customer.name,
        phone_number: order.customer.phoneNumber,
        email: order.customer.email ?? null,
        user_id: order.customer.userId ?? null,
      },
      creator_id: order.creator_id,
      creator_name: creatorName,
      items,
      delivery: delivery
        ? {
            id: delivery.id,
            tracking_number: delivery.tracking_number,
            tracking_url: delivery.tracking_url,
            delivery_method: delivery.delivery_method,
            status: delivery.status,
            delivery_charge: Number(delivery.delivery_charge),
          }
        : null,
      financial_summary: {
        subtotal: Number(order.subtotal),
        delivery_fee: Number(order.delivery_fee),
        discount_amount: Number(order.discount_amount),
        grand_total: Number(order.grand_total),
        total_commission,
        total_platform_fees,
        total_vendor_net,
      },
    };
  }

  async findOneForUser(id: string, user: JwtPayload): Promise<OrderAdminView | OrderCreatorView | OrderVendorView> {
    if (user.user_type === USER_TYPE.ADMIN) {
      return this.buildAdminOrderView(id);
    }

    try {
      const order = await this.orderRepo.findOne({ where: { id }, relations: ['items'] });
      if (!order) throw new NotFoundException(`Order with ID ${id} not found`);

      const allItemIds = order.items.map((i) => i.id);
      const commissions = await this.commissionsService.getByOrderItemIds(allItemIds);
      const commissionMap = new Map(commissions.map((c) => [c.order_item_id, c]));

      if (user.user_type === USER_TYPE.CREATOR) {
        const uniqueVendorIds = [...new Set(order.items.map((i) => i.vendor_id))];
        const vendorNameMap = await this.authClient.getVendorNames(uniqueVendorIds);
        return this.buildCreatorOrderView(order, commissionMap, vendorNameMap);
      }

      const creatorName = order.creator_id
        ? (await this.authClient.getCreatorNames([order.creator_id]))[order.creator_id] ?? null
        : null;
      return this.buildVendorOrderView(order, commissionMap, user.id, creatorName);
    } catch (error) {
      handleServiceError(error, 'Failed to fetch order', 'OrdersService');
    }
  }

  async findByCreator(creatorId: string, query: OrderQueryDto): Promise<PaginatedResponse<OrderCreatorView>> {
    const paginated = await this.findAll({ ...query, creator_id: creatorId });
    const allItemIds = paginated.data.flatMap((o) => o.items.map((i) => i.id));
    const commissions = await this.commissionsService.getByOrderItemIds(allItemIds);
    const commissionMap = new Map(commissions.map((c) => [c.order_item_id, c]));

    const uniqueVendorIds = [
      ...new Set(paginated.data.flatMap((o) => o.items.map((i) => i.vendor_id))),
    ];
    const vendorNameMap = await this.authClient.getVendorNames(uniqueVendorIds);

    return {
      ...paginated,
      data: paginated.data.map((o) => this.buildCreatorOrderView(o, commissionMap, vendorNameMap)),
    };
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    try {
      const order = await this.findOne(id);

      const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status];
      if (!allowedTransitions.includes(dto.status)) {
        throw new BadRequestException(`Cannot transition from ${order.status} to ${dto.status}`);
      }

      order.status = dto.status;

      if (dto.status === ORDER_STATUS.PAID) {
        order.ispaid = true;
      }

      if (dto.status === ORDER_STATUS.DELIVERED && order.payment_method === PAYMENT_METHOD.COD) {
        order.ispaid = true;
      }

      await this.orderRepo.save(order);

      if (dto.status === ORDER_STATUS.SHIPPED) {
        await this.deliveryService.create(id, Number(order.delivery_fee));
        if (dto.tracking_number || dto.tracking_url || dto.delivery_method) {
          await this.deliveryService.update(id, {
            tracking_number: dto.tracking_number,
            tracking_url: dto.tracking_url,
            delivery_method: dto.delivery_method,
            status: DELIVERY_STATUS.IN_TRANSIT,
          });
        }
      }

      const updatedOrder = await this.findOne(id);
      const itemIds = updatedOrder.items.map((i) => i.id);

      if (dto.status === ORDER_STATUS.PAID) {
        this.commissionsService
          .createFromOrderItems(updatedOrder.items)
          .catch((err: Error) => this.logger.warn(`Commission creation failed: ${err.message}`));
      } else if (dto.status === ORDER_STATUS.SHIPPED) {
        this.commissionsService
          .moveToEscrow(itemIds)
          .catch((err: Error) => this.logger.warn(`Commission escrow failed: ${err.message}`));
      } else if (dto.status === ORDER_STATUS.DELIVERED) {
        this.commissionsService
          .releaseEscrow(itemIds)
          .catch((err: Error) => this.logger.warn(`Commission release failed: ${err.message}`));
      } else if (dto.status === ORDER_STATUS.CANCELLED) {
        this.commissionsService
          .cancelByOrderItems(itemIds)
          .catch((err: Error) => this.logger.warn(`Commission cancel failed: ${err.message}`));
      }

      const ref = updatedOrder.id.slice(-8).toUpperCase()

      if (updatedOrder.creator_id) {
        const creatorNotifMap: Partial<Record<ORDER_STATUS, { title: string; message: string }>> = {
          [ORDER_STATUS.PAID]: {
            title: 'Commission Earned',
            message: `Order #${ref} has been paid — your commission is pending.`,
          },
          [ORDER_STATUS.DELIVERED]: {
            title: 'Order Delivered',
            message: `Order #${ref} has been successfully delivered.`,
          },
          [ORDER_STATUS.CANCELLED]: {
            title: 'Order Cancelled',
            message: `Order #${ref} has been cancelled.`,
          },
        }

        const creatorNotif = creatorNotifMap[dto.status]
        if (creatorNotif) {
          this.notificationClient
            .send({
              userId: updatedOrder.creator_id,
              id: `order-${dto.status}-${updatedOrder.id}`,
              title: creatorNotif.title,
              message: creatorNotif.message,
              link: '/dashboard/my-orders',
              source: 'order-service',
            })
            .catch((err: Error) => this.logger.warn(`Notification failed: ${err.message}`))
        }
      }

      const vendorNotifMap: Partial<Record<ORDER_STATUS, { title: string; message: string }>> = {
        [ORDER_STATUS.SHIPPED]: {
          title: 'Order Shipped',
          message: `Order #${ref} has been marked as shipped.`,
        },
        [ORDER_STATUS.DELIVERED]: {
          title: 'Order Delivered',
          message: `Order #${ref} has been delivered successfully.`,
        },
        [ORDER_STATUS.CANCELLED]: {
          title: 'Order Cancelled',
          message: `Order #${ref} has been cancelled.`,
        },
      }

      const vendorNotif = vendorNotifMap[dto.status]
      if (vendorNotif) {
        const uniqueVendorIds = [...new Set(updatedOrder.items.map((i) => i.vendor_id))]
        uniqueVendorIds.forEach((vendorId) => {
          this.notificationClient
            .send({
              userId: vendorId,
              id: `order-${dto.status}-vendor-${vendorId}-${updatedOrder.id}`,
              title: vendorNotif.title,
              message: vendorNotif.message,
              link: '/dashboard/my-orders',
              source: 'order-service',
            })
            .catch((err: Error) => this.logger.warn(`Notification failed: ${err.message}`))
        })
      }

      const customerNotifMap: Partial<Record<ORDER_STATUS, { title: string; message: string }>> = {
        [ORDER_STATUS.PAID]: {
          title: 'Payment Confirmed',
          message: `Your payment for order #${ref} has been confirmed.`,
        },
        [ORDER_STATUS.SHIPPED]: {
          title: 'Order Shipped',
          message: `Your order #${ref} is on its way!`,
        },
        [ORDER_STATUS.DELIVERED]: {
          title: 'Order Delivered',
          message: `Your order #${ref} has been delivered. Enjoy!`,
        },
        [ORDER_STATUS.CANCELLED]: {
          title: 'Order Cancelled',
          message: `Your order #${ref} has been cancelled.`,
        },
      }

      const customerNotif = customerNotifMap[dto.status]
      if (customerNotif && updatedOrder.customer?.userId) {
        this.notificationClient
          .send({
            userId: updatedOrder.customer.userId,
            id: `order-${dto.status}-customer-${updatedOrder.id}`,
            title: customerNotif.title,
            message: customerNotif.message,
            link: '/dashboard/my-orders',
            source: 'order-service',
          })
          .catch((err: Error) => this.logger.warn(`Notification failed: ${err.message}`))
      }

      return updatedOrder;
    } catch (error) {
      handleServiceError(error, 'Failed to update order status', 'OrdersService');
    }
  }

  async cancel(id: string, userId: string): Promise<Order> {
    try {
      const order = await this.findOne(id);

      if (order.customer_id !== userId) {
        throw new BadRequestException('You can only cancel your own orders');
      }

      const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status];
      if (!allowedTransitions.includes(ORDER_STATUS.CANCELLED)) {
        throw new BadRequestException(`Cannot cancel order with status ${order.status}`);
      }

      order.status = ORDER_STATUS.CANCELLED;
      await this.orderRepo.save(order);

      return this.findOne(id);
    } catch (error) {
      handleServiceError(error, 'Failed to cancel order', 'OrdersService');
    }
  }

  async adminCancel(id: string): Promise<Order> {
    try {
      const order = await this.findOne(id);

      const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status];
      if (!allowedTransitions.includes(ORDER_STATUS.CANCELLED)) {
        throw new BadRequestException(`Cannot cancel order with status ${order.status}`);
      }

      order.status = ORDER_STATUS.CANCELLED;
      await this.orderRepo.save(order);

      return this.findOne(id);
    } catch (error) {
      handleServiceError(error, 'Failed to cancel order', 'OrdersService');
    }
  }

  async getOrderTotals(orderIds: string[]): Promise<{ id: string; grand_total: number }[]> {
    try {
      if (orderIds.length === 0) return [];

      const orders = await this.orderRepo
        .createQueryBuilder('order')
        .select(['order.id', 'order.grand_total'])
        .where('order.id IN (:...orderIds)', { orderIds })
        .getMany();

      return orders.map((o) => ({ id: o.id, grand_total: Number(o.grand_total) }));
    } catch (error) {
      handleServiceError(error, 'Failed to get order totals', 'OrdersService');
    }
  }

  async trackOrder(dto: TrackOrderDto): Promise<{
    order_id: string;
    status: ORDER_STATUS;
    created_at: Date;
    updated_at: Date;
    delivery: Delivery | null;
  }> {
    try {
      const order = await this.orderRepo.findOne({
        where: { id: dto.order_id },
        relations: ['customer'],
      });

      if (!order || !order.customer) {
        throw new NotFoundException('Order not found');
      }

      if (order.customer.phoneNumber !== dto.phone_number) {
        throw new NotFoundException('Order not found');
      }

      let delivery: Delivery | null = null;
      try {
        delivery = await this.deliveryService.findByOrderId(order.id);
      } catch {
        // no delivery record yet
      }

      return {
        order_id: order.id,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at,
        delivery,
      };
    } catch (error) {
      handleServiceError(error, 'Failed to track order', 'OrdersService');
    }
  }

  async trackOrdersByPhone(phoneNumber: string): Promise<{
    orders: Array<{
      order_id: string;
      status: ORDER_STATUS;
      created_at: Date;
      updated_at: Date;
    }>;
  }> {
    try {
      let customer;
      try {
        customer = await this.customersService.findByPhone(phoneNumber);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to find customer by phone during order tracking: ${message}`);
        return { orders: [] };
      }

      const orders = await this.orderRepo.find({
        where: [
          { customer_id: customer.id, status: ORDER_STATUS.PENDING },
          { customer_id: customer.id, status: ORDER_STATUS.PAID },
          { customer_id: customer.id, status: ORDER_STATUS.SHIPPED },
        ],
        order: { created_at: 'DESC' },
      });

      return {
        orders: orders.map((order) => ({
          order_id: order.id,
          status: order.status,
          created_at: order.created_at,
          updated_at: order.updated_at,
        })),
      };
    } catch (error) {
      handleServiceError(error, 'Failed to track orders by phone', 'OrdersService');
    }
  }

  async findByVendor(vendorId: string, query: OrderQueryDto): Promise<PaginatedResponse<OrderVendorView>> {
    try {
      const { page = 1, limit = 20, status } = query;
      const skip = (page - 1) * limit;

      const qb = this.orderRepo
        .createQueryBuilder('order')
        .innerJoin('order.items', 'filterItem', 'filterItem.vendor_id = :vendorId', { vendorId })
        .leftJoinAndSelect('order.items', 'items')
        .orderBy('order.created_at', 'DESC')
        .skip(skip)
        .take(limit);

      if (status) {
        qb.andWhere('order.status = :status', { status });
      }

      const [orders, total] = await qb.getManyAndCount();

      const allItemIds = orders.flatMap((o) => o.items.map((i) => i.id));
      const commissions = await this.commissionsService.getByOrderItemIds(allItemIds);
      const commissionMap = new Map(commissions.map((c) => [c.order_item_id, c]));

      const uniqueCreatorIds = [
        ...new Set(
          orders.map((o) => o.creator_id).filter((id): id is string => id !== null),
        ),
      ];
      const creatorNameMap = await this.authClient.getCreatorNames(uniqueCreatorIds);

      const data = orders.map((o) =>
        this.buildVendorOrderView(
          o,
          commissionMap,
          vendorId,
          o.creator_id ? (creatorNameMap[o.creator_id] ?? null) : null,
        ),
      );

      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      handleServiceError(error, 'Failed to fetch vendor orders', 'OrdersService');
    }
  }

  async findMyOrders(userId: string, query: OrderQueryDto): Promise<PaginatedResponse<Order>> {
    try {
      const customer = await this.customersService.findByUserId(userId);
      return this.findByCustomer(customer.id, query);
    } catch (error) {
      handleServiceError(error, 'Failed to fetch customer orders', 'OrdersService');
    }
  }

  async getVendorAnalytics(vendorId: string): Promise<VendorAnalytics> {
    try {
      const orders = await this.orderRepo
        .createQueryBuilder('order')
        .innerJoin('order.items', 'item', 'item.vendor_id = :vendorId', { vendorId })
        .select(['order.status', 'order.grand_total'])
        .getMany();

      const total_orders = orders.length;
      const total_revenue = orders
        .filter((o) => o.status !== ORDER_STATUS.CANCELLED)
        .reduce((sum, o) => sum + Number(o.grand_total), 0);

      return {
        total_orders,
        total_revenue,
        pending_orders: orders.filter((o) => o.status === ORDER_STATUS.PENDING).length,
        paid_orders: orders.filter((o) => o.status === ORDER_STATUS.PAID).length,
        shipped_orders: orders.filter((o) => o.status === ORDER_STATUS.SHIPPED).length,
        delivered_orders: orders.filter((o) => o.status === ORDER_STATUS.DELIVERED).length,
        cancelled_orders: orders.filter((o) => o.status === ORDER_STATUS.CANCELLED).length,
      };
    } catch (error) {
      handleServiceError(error, 'Failed to fetch vendor analytics', 'OrdersService');
    }
  }

  async adminFindAll(query: AdminOrderQueryDto): Promise<PaginatedResponse<OrderAdminView>> {
    try {
      const { page = 1, limit = 20, status, customer_id, creator_id, vendor_id } = query;
      const skip = (page - 1) * limit;

      const qb = this.orderRepo
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.customer', 'customer')
        .orderBy('order.created_at', 'DESC')
        .skip(skip)
        .take(limit);

      if (vendor_id) {
        qb.innerJoin('order.items', 'filterItem', 'filterItem.vendor_id = :vendor_id', { vendor_id });
      }

      qb.leftJoinAndSelect('order.items', 'items');

      if (status) {
        qb.andWhere('order.status = :status', { status });
      }
      if (customer_id) {
        qb.andWhere('order.customer_id = :customer_id', { customer_id });
      }
      if (creator_id) {
        qb.andWhere('order.creator_id = :creator_id', { creator_id });
      }

      const [orders, total] = await qb.getManyAndCount();

      const orderIds = orders.map((o) => o.id);
      const allItemIds = orders.flatMap((o) => o.items.map((i) => i.id));
      const uniqueVendorIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.vendor_id)))];
      const uniqueCreatorIds = [
        ...new Set(orders.map((o) => o.creator_id).filter((id): id is string => id !== null)),
      ];

      const [commissions, vendorNameMap, creatorNameMap, deliveries] = await Promise.all([
        this.commissionsService.getByOrderItemIds(allItemIds),
        this.authClient.getVendorNames(uniqueVendorIds),
        this.authClient.getCreatorNames(uniqueCreatorIds),
        this.deliveryService.findByOrderIds(orderIds),
      ]);

      const commissionMap = new Map(commissions.map((c) => [c.order_item_id, c]));
      const deliveryMap = new Map(deliveries.map((d) => [d.order_id, d]));

      const data: OrderAdminView[] = orders.map((order) => {
        const items = order.items.map((item) =>
          this.buildAdminItemView(item, commissionMap, vendorNameMap),
        );

        const total_commission = items.reduce((sum, i) => sum + (i.commission?.commission_amount ?? 0), 0);
        const total_platform_fees = items.reduce((sum, i) => sum + (i.commission?.platform_fee ?? 0), 0);
        const total_vendor_net = items.reduce((sum, i) => sum + (i.commission?.vendor_net ?? 0), 0);

        const delivery = deliveryMap.get(order.id) ?? null;

        return {
          id: order.id,
          status: order.status,
          payment_method: order.payment_method,
          ispaid: order.ispaid,
          shipping_address: order.shipping_address,
          created_at: order.created_at,
          updated_at: order.updated_at,
          customer: {
            id: order.customer.id,
            name: order.customer.name,
            phone_number: order.customer.phoneNumber,
            email: order.customer.email ?? null,
            user_id: order.customer.userId ?? null,
          },
          creator_id: order.creator_id,
          creator_name: order.creator_id ? (creatorNameMap[order.creator_id] ?? null) : null,
          items,
          delivery: delivery
            ? {
                id: delivery.id,
                tracking_number: delivery.tracking_number,
                tracking_url: delivery.tracking_url,
                delivery_method: delivery.delivery_method,
                status: delivery.status,
                delivery_charge: Number(delivery.delivery_charge),
              }
            : null,
          financial_summary: {
            subtotal: Number(order.subtotal),
            delivery_fee: Number(order.delivery_fee),
            discount_amount: Number(order.discount_amount),
            grand_total: Number(order.grand_total),
            total_commission,
            total_platform_fees,
            total_vendor_net,
          },
        };
      });

      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      handleServiceError(error, 'Failed to fetch admin orders', 'OrdersService');
    }
  }

  async getAdminStats(): Promise<AdminOrderStats> {
    try {
      const [orders, commissionTotals] = await Promise.all([
        this.orderRepo
          .createQueryBuilder('order')
          .select(['order.status', 'order.grand_total'])
          .getMany(),
        this.commissionsService.getPlatformCommissionTotals(),
      ]);

      const total_orders = orders.length;
      const total_revenue = orders
        .filter((o) => o.status !== ORDER_STATUS.CANCELLED)
        .reduce((sum, o) => sum + Number(o.grand_total), 0);

      return {
        total_orders,
        total_revenue,
        pending_orders: orders.filter((o) => o.status === ORDER_STATUS.PENDING).length,
        paid_orders: orders.filter((o) => o.status === ORDER_STATUS.PAID).length,
        shipped_orders: orders.filter((o) => o.status === ORDER_STATUS.SHIPPED).length,
        delivered_orders: orders.filter((o) => o.status === ORDER_STATUS.DELIVERED).length,
        cancelled_orders: orders.filter((o) => o.status === ORDER_STATUS.CANCELLED).length,
        total_commission: commissionTotals.total_commission,
        total_platform_fees: commissionTotals.total_platform_fees,
      };
    } catch (error) {
      handleServiceError(error, 'Failed to fetch admin stats', 'OrdersService');
    }
  }
}
