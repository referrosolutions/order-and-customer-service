import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ORDER_STATUS, ORDER_STATUS_TRANSITIONS } from 'src/core/enums';
import { OrderItem } from 'src/entity/order-item.entity';
import { Order } from 'src/entity/order.entity';
import { PaginatedResponse } from 'src/types';
import { handleServiceError } from 'src/utils/error';
import { NotificationClient } from 'src/utils/notification.client';
import { DataSource, Repository } from 'typeorm';
import { CustomersService } from '../customers/customers.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { JwtPayload } from 'src/types';
import { OrderQueryDto } from './dto/order-query.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

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
  ) {}

  private async resolveAffiliate(sessionId: string): Promise<{
    storeId: string | null;
    creatorId: string | null;
    affiliateId: string | null;
  }> {
    const affiliateServiceUrl = process.env.AFFILIATE_SERVICE_URL || 'http://localhost:9003';
    try {
      const res = await fetch(`${affiliateServiceUrl}/v1/tracking/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
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

      const { storeId, creatorId, affiliateId } = sessionId
        ? await this.resolveAffiliate(sessionId)
        : { storeId: null, creatorId: null, affiliateId: null };

      return await this.saveOrderWithItems(
        customer.id,
        dto.items,
        dto.payment_method,
        subtotal,
        deliveryFee,
        discountAmount,
        grandTotal,
        dto.shipping_address ?? null,
        storeId,
        creatorId,
        affiliateId,
      );
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

      const { storeId, creatorId, affiliateId } = sessionId
        ? await this.resolveAffiliate(sessionId)
        : { storeId: null, creatorId: null, affiliateId: null };

      return await this.saveOrderWithItems(
        customer.id,
        dto.items,
        dto.payment_method,
        subtotal,
        deliveryFee,
        discountAmount,
        grandTotal,
        dto.customer.address ?? null,
        storeId,
        creatorId,
        affiliateId,
      );
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

  async findOne(id: string): Promise<Order> {
    try {
      const order = await this.orderRepo.findOne({
        where: { id },
        relations: ['items', 'customer'],
      });

      if (!order) {
        throw new NotFoundException(`Order with ID ${id} not found`);
      }

      return order;
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

  async findByCreator(creatorId: string, query: OrderQueryDto): Promise<PaginatedResponse<Order>> {
    return this.findAll({ ...query, creator_id: creatorId });
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

      await this.orderRepo.save(order);

      const updatedOrder = await this.findOne(id);

      if (updatedOrder.creator_id) {
        const notificationMap: Partial<Record<ORDER_STATUS, { title: string; message: string }>> = {
          [ORDER_STATUS.PAID]: {
            title: 'Commission Earned',
            message: `Order #${updatedOrder.id.slice(-8).toUpperCase()} has been paid — your commission is pending.`,
          },
          [ORDER_STATUS.DELIVERED]: {
            title: 'Order Delivered',
            message: `Order #${updatedOrder.id.slice(-8).toUpperCase()} has been successfully delivered.`,
          },
          [ORDER_STATUS.CANCELLED]: {
            title: 'Order Cancelled',
            message: `Order #${updatedOrder.id.slice(-8).toUpperCase()} has been cancelled.`,
          },
        };

        const notif = notificationMap[dto.status];
        if (notif) {
          this.notificationClient
            .send({
              userId: updatedOrder.creator_id,
              id: `order-${dto.status}-${updatedOrder.id}`,
              title: notif.title,
              message: notif.message,
              link: `/dashboard/orders/${updatedOrder.id}`,
              source: 'order-service',
            })
            .catch((err: Error) =>
              this.logger.error(`Failed to send notification: ${err.message}`),
            );
        }
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

      return {
        order_id: order.id,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at,
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

  async findByVendor(vendorId: string, query: OrderQueryDto): Promise<PaginatedResponse<Order>> {
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

      const [data, total] = await qb.getManyAndCount();

      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      handleServiceError(error, 'Failed to fetch vendor orders', 'OrdersService');
    }
  }
}
