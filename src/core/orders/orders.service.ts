import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from 'src/entity/order.entity';
import { OrderItem } from 'src/entity/order-item.entity';
import { Delivery } from 'src/entity/delivery.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import {
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  DELIVERY_STATUS,
} from 'src/core/enums';
import { handleServiceError } from 'src/utils/error';
import { PaginatedResponse } from 'src/types';
import { CustomersService } from '../customers/customers.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    private readonly dataSource: DataSource,
    private readonly customersService: CustomersService,
  ) {}

  async create(customerId: string, dto: CreateOrderDto): Promise<Order> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Calculate total amount from items
        const totalItemsAmount = dto.items.reduce(
          (sum, item) => sum + item.unit_price * item.quantity,
          0,
        );
        const totalAmount = totalItemsAmount + (dto.delivery_charge ?? 0);

        // Create the order
        const order = manager.create(Order, {
          customer_id: customerId,
          creator_id: dto.creator_id ?? null,
          affiliate_id: dto.affiliate_id ?? null,
          payment_method: dto.payment_method,
          total_amount: totalAmount,
          status: ORDER_STATUS.PENDING,
        });
        const savedOrder = await manager.save(order);

        // Create order items
        const orderItems = dto.items.map((item) =>
          manager.create(OrderItem, {
            order_id: savedOrder.id,
            variant_id: item.variant_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.unit_price * item.quantity,
          }),
        );
        await manager.save(orderItems);

        // Create delivery record
        const delivery = manager.create(Delivery, {
          order_id: savedOrder.id,
          delivery_method: dto.delivery_method,
          delivery_charge: dto.delivery_charge ?? 0,
          status: DELIVERY_STATUS.PENDING,
        });
        await manager.save(delivery);

        // Return the order with relations
        return manager.findOne(Order, {
          where: { id: savedOrder.id },
          relations: ['items', 'delivery'],
        }) as Promise<Order>;
      });
    } catch (error) {
      handleServiceError(error, 'Failed to create order', 'OrdersService');
    }
  }

  async createGuestOrder(dto: CreateGuestOrderDto): Promise<Order> {
    try {
      // 1. Find or create guest customer
      const customer = await this.customersService.findOrCreate({
        name: dto.customer.name,
        phoneNumber: dto.customer.phone_number,
        address: {
          street: dto.customer.address,
        },
      });

      // 2. Create order in a transaction
      const order = await this.dataSource.transaction(async (manager) => {
        const totalItemsAmount = dto.items.reduce(
          (sum, item) => sum + item.unit_price * item.quantity,
          0,
        );
        const totalAmount = totalItemsAmount + (dto.delivery_charge ?? 0);

        const newOrder = manager.create(Order, {
          customer_id: customer.id,
          creator_id: null,
          payment_method: dto.payment_method,
          total_amount: totalAmount,
          status: ORDER_STATUS.PENDING,
        });
        const savedOrder = await manager.save(newOrder);

        const orderItems = dto.items.map((item) =>
          manager.create(OrderItem, {
            order_id: savedOrder.id,
            variant_id: item.variant_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.unit_price * item.quantity,
          }),
        );
        await manager.save(orderItems);

        const delivery = manager.create(Delivery, {
          order_id: savedOrder.id,
          delivery_method: dto.delivery_method,
          delivery_charge: dto.delivery_charge ?? 0,
          status: DELIVERY_STATUS.PENDING,
        });
        await manager.save(delivery);

        return manager.findOne(Order, {
          where: { id: savedOrder.id },
          relations: ['items', 'delivery'],
        }) as Promise<Order>;
      });

      // 3. Resolve affiliate attribution — awaitable with graceful fallback
      if (dto.affiliate_session_id) {
        const affiliateServiceUrl =
          process.env.AFFILIATE_SERVICE_URL || 'http://localhost:9003';
        try {
          const res = await fetch(`${affiliateServiceUrl}/v1/tracking/convert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: dto.affiliate_session_id,
              order_id: order.id,
            }),
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              creator_id?: string;
              affiliate_id?: string;
            } | null;
            if (data && (data.creator_id || data.affiliate_id)) {
              await this.orderRepo.update(order.id, {
                creator_id: data.creator_id ?? null,
                affiliate_id: data.affiliate_id ?? null,
              });
              order.creator_id = data.creator_id ?? null;
              order.affiliate_id = data.affiliate_id ?? null;
            }
          }
        } catch (err) {
          this.logger.warn(
            `Affiliate attribution failed (order still created): ${(err as Error).message}`,
          );
        }
      }

      return order;
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
        .leftJoinAndSelect('order.delivery', 'delivery')
        .orderBy('order.created_at', 'DESC')
        .skip(skip)
        .take(limit);

      if (status) {
        queryBuilder.andWhere('order.status = :status', { status });
      }
      if (customer_id) {
        queryBuilder.andWhere('order.customer_id = :customer_id', {
          customer_id,
        });
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
        relations: ['items', 'delivery'],
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

  async findByCreator(
    creatorId: string,
    query: OrderQueryDto,
  ): Promise<PaginatedResponse<Order>> {
    return this.findAll({ ...query, creator_id: creatorId });
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    try {
      const order = await this.findOne(id);

      // Validate status transition
      const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status];
      if (!allowedTransitions.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot transition from ${order.status} to ${dto.status}`,
        );
      }

      // If shipping, require tracking number
      if (dto.status === ORDER_STATUS.SHIPPED && !dto.tracking_number) {
        throw new BadRequestException(
          'Tracking number is required when marking order as shipped',
        );
      }

      // Update order status
      order.status = dto.status;
      await this.orderRepo.save(order);

      // Update delivery info if provided
      if (dto.tracking_number || dto.tracking_url) {
        const delivery = await this.deliveryRepo.findOne({
          where: { order_id: id },
        });
        if (delivery) {
          if (dto.tracking_number) {
            delivery.tracking_number = dto.tracking_number;
          }
          if (dto.tracking_url) {
            delivery.tracking_url = dto.tracking_url;
          }
          // Update delivery status based on order status
          if (dto.status === ORDER_STATUS.SHIPPED) {
            delivery.status = DELIVERY_STATUS.IN_TRANSIT;
          } else if (dto.status === ORDER_STATUS.DELIVERED) {
            delivery.status = DELIVERY_STATUS.DELIVERED;
          }
          await this.deliveryRepo.save(delivery);
        }
      }

      return this.findOne(id);
    } catch (error) {
      handleServiceError(
        error,
        'Failed to update order status',
        'OrdersService',
      );
    }
  }

  async cancel(id: string, userId: string): Promise<Order> {
    try {
      const order = await this.findOne(id);

      // Check if order belongs to the user or if user is admin (handled in controller)
      if (order.customer_id !== userId) {
        throw new BadRequestException('You can only cancel your own orders');
      }

      // Validate status transition
      const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status];
      if (!allowedTransitions.includes(ORDER_STATUS.CANCELLED)) {
        throw new BadRequestException(
          `Cannot cancel order with status ${order.status}`,
        );
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

      // Admin can cancel orders that are pending or paid
      const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status];
      if (!allowedTransitions.includes(ORDER_STATUS.CANCELLED)) {
        throw new BadRequestException(
          `Cannot cancel order with status ${order.status}`,
        );
      }

      order.status = ORDER_STATUS.CANCELLED;
      await this.orderRepo.save(order);

      return this.findOne(id);
    } catch (error) {
      handleServiceError(error, 'Failed to cancel order', 'OrdersService');
    }
  }

  async getOrderTotals(
    orderIds: string[],
  ): Promise<{ id: string; total_amount: number }[]> {
    try {
      if (orderIds.length === 0) return [];

      const orders = await this.orderRepo
        .createQueryBuilder('order')
        .select(['order.id', 'order.total_amount'])
        .where('order.id IN (:...orderIds)', { orderIds })
        .getMany();

      return orders.map((o) => ({ id: o.id, total_amount: Number(o.total_amount) }));
    } catch (error) {
      handleServiceError(error, 'Failed to get order totals', 'OrdersService');
    }
  }

  async trackOrder(dto: TrackOrderDto): Promise<{
    order_id: string;
    status: ORDER_STATUS;
    delivery: {
      status: DELIVERY_STATUS;
      tracking_number: string | null;
      tracking_url: string | null;
      delivery_method: string;
    };
    created_at: Date;
    updated_at: Date;
  }> {
    try {
      const order = await this.orderRepo.findOne({
        where: { id: dto.order_id },
        relations: ['delivery', 'customer'],
      });

      if (!order || !order.customer) {
        throw new NotFoundException('Order not found');
      }

      // Verify phone number matches the customer record
      if (order.customer.phoneNumber !== dto.phone_number) {
        throw new NotFoundException('Order not found');
      }

      return {
        order_id: order.id,
        status: order.status,
        delivery: {
          status: order.delivery?.status ?? DELIVERY_STATUS.PENDING,
          tracking_number: order.delivery?.tracking_number ?? null,
          tracking_url: order.delivery?.tracking_url ?? null,
          delivery_method: order.delivery?.delivery_method ?? 'standard',
        },
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
      delivery: {
        status: DELIVERY_STATUS;
        tracking_number: string | null;
        tracking_url: string | null;
        delivery_method: string;
      };
      created_at: Date;
      updated_at: Date;
    }>;
  }> {
    try {
      let customer;
      try {
        customer = await this.customersService.findByPhone(phoneNumber);
      } catch {
        return { orders: [] };
      }

      const orders = await this.orderRepo.find({
        where: [
          { customer_id: customer.id, status: ORDER_STATUS.PENDING },
          { customer_id: customer.id, status: ORDER_STATUS.PAID },
          { customer_id: customer.id, status: ORDER_STATUS.SHIPPED },
        ],
        relations: ['delivery'],
        order: { created_at: 'DESC' },
      });

      return {
        orders: orders.map((order) => ({
          order_id: order.id,
          status: order.status,
          delivery: {
            status: order.delivery?.status ?? DELIVERY_STATUS.PENDING,
            tracking_number: order.delivery?.tracking_number ?? null,
            tracking_url: order.delivery?.tracking_url ?? null,
            delivery_method: order.delivery?.delivery_method ?? 'standard',
          },
          created_at: order.created_at,
          updated_at: order.updated_at,
        })),
      };
    } catch (error) {
      handleServiceError(
        error,
        'Failed to track orders by phone',
        'OrdersService',
      );
    }
  }

  async findByVendor(
    vendorId: string,
    query: OrderQueryDto,
  ): Promise<PaginatedResponse<Order>> {
    try {
      const productServiceUrl =
        process.env.PRODUCT_SERVICE_URL || 'http://localhost:9002';
      let variantIds: string[] = [];

      try {
        const res = await fetch(
          `${productServiceUrl}/v1/products/vendor/${vendorId}/variant-ids`,
        );
        if (res.ok) {
          const data = (await res.json()) as { variantIds: string[] };
          variantIds = data.variantIds ?? [];
        }
      } catch (fetchErr) {
        this.logger.warn(
          `Failed to fetch variant IDs from product-service: ${(fetchErr as Error).message}`,
        );
      }

      const { page = 1, limit = 20, status } = query;

      if (variantIds.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }

      const skip = (page - 1) * limit;

      const qb = this.orderRepo
        .createQueryBuilder('order')
        .innerJoin(
          'order.items',
          'filterItem',
          'filterItem.variant_id IN (:...variantIds)',
          { variantIds },
        )
        .leftJoinAndSelect('order.items', 'items')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .orderBy('order.created_at', 'DESC')
        .skip(skip)
        .take(limit);

      if (status) {
        qb.andWhere('order.status = :status', { status });
      }

      const [data, total] = await qb.getManyAndCount();

      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      handleServiceError(
        error,
        'Failed to fetch vendor orders',
        'OrdersService',
      );
    }
  }
}
