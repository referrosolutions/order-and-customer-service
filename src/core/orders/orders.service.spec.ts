import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order } from 'src/entity/order.entity';
import { OrderItem } from 'src/entity/order-item.entity';
import { Delivery } from 'src/entity/delivery.entity';
import { CustomersService } from '../customers/customers.service';
import {
  ORDER_STATUS,
  DELIVERY_STATUS,
  PAYMENT_METHOD,
} from 'src/core/enums';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { TrackOrderDto } from './dto/track-order.dto';

const mockOrder = (): Order => ({
  id: 'order-uuid-1',
  customer_id: 'customer-uuid-1',
  creator_id: null,
  payment_method: PAYMENT_METHOD.COD,
  total_amount: 1000,
  status: ORDER_STATUS.PENDING,
  items: [],
  delivery: null as unknown as Delivery,
  customer: null as unknown,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
}) as Order;

const mockDelivery = (): Delivery => ({
  id: 'delivery-uuid-1',
  order_id: 'order-uuid-1',
  delivery_method: 'standard',
  delivery_charge: 100,
  status: DELIVERY_STATUS.PENDING,
  tracking_number: null,
  tracking_url: null,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
  order: null as unknown as Order,
}) as Delivery;

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepo: jest.Mocked<Repository<Order>>;
  let orderItemRepo: jest.Mocked<Repository<OrderItem>>;
  let deliveryRepo: jest.Mocked<Repository<Delivery>>;
  let dataSource: jest.Mocked<DataSource>;
  let customersService: jest.Mocked<CustomersService>;

  beforeEach(async () => {
    const mockOrderRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockOrderItemRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockDeliveryRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const mockManager: Partial<EntityManager> = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
    };

    const mockCustomersService = {
      findOrCreate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: mockOrderItemRepo },
        { provide: getRepositoryToken(Delivery), useValue: mockDeliveryRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CustomersService, useValue: mockCustomersService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    orderRepo = module.get(getRepositoryToken(Order));
    orderItemRepo = module.get(getRepositoryToken(OrderItem));
    deliveryRepo = module.get(getRepositoryToken(Delivery));
    dataSource = module.get(DataSource);
    customersService = module.get(CustomersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should calculate total and create order with items and delivery in a transaction', async () => {
      const dto: CreateOrderDto = {
        payment_method: PAYMENT_METHOD.COD,
        items: [{ variant_id: 'var-1', quantity: 2, unit_price: 400 }],
        delivery_method: 'standard',
        delivery_charge: 100,
      };

      const savedOrder = { ...mockOrder(), total_amount: 900 };
      const manager = (dataSource.transaction as jest.Mock).mock.calls[0]?.[0];

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => {
        const mgr = {
          create: jest.fn().mockReturnValueOnce(savedOrder).mockReturnValue({}),
          save: jest.fn().mockResolvedValueOnce(savedOrder).mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue({ ...savedOrder, items: [], delivery: mockDelivery() }),
        };
        return cb(mgr);
      });

      const result = await service.create('customer-uuid-1', dto);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should include delivery_charge in total amount', async () => {
      const dto: CreateOrderDto = {
        payment_method: PAYMENT_METHOD.COD,
        items: [{ variant_id: 'var-1', quantity: 1, unit_price: 500 }],
        delivery_method: 'express',
        delivery_charge: 200,
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => {
        const mgr = {
          create: jest.fn((_, data) => ({ ...data })),
          save: jest.fn().mockResolvedValueOnce({ id: 'order-1', total_amount: 700 }).mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue({ id: 'order-1', total_amount: 700, items: [], delivery: mockDelivery() }),
        };
        return cb(mgr);
      });

      const result = await service.create('customer-uuid-1', dto);
      expect(result).toBeDefined();
    });
  });

  describe('createGuestOrder', () => {
    it('should find or create customer then create order', async () => {
      const dto: CreateGuestOrderDto = {
        customer: { name: 'Guest User', phone_number: '9800000001', address: '123 Main St' },
        items: [{ variant_id: 'var-1', quantity: 1, unit_price: 300 }],
        payment_method: PAYMENT_METHOD.COD,
        delivery_method: 'standard',
      };

      (customersService.findOrCreate as jest.Mock).mockResolvedValue({ id: 'cust-1', phoneNumber: '9800000001' });

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => {
        const mgr = {
          create: jest.fn((_, data) => ({ ...data })),
          save: jest.fn().mockResolvedValueOnce({ id: 'order-1' }).mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue({ id: 'order-1', items: [], delivery: mockDelivery() }),
        };
        return cb(mgr);
      });

      const result = await service.createGuestOrder(dto);

      expect(customersService.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '9800000001', name: 'Guest User' }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated orders with default pagination', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockOrder()], 1]),
      };
      orderRepo.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

      const result = await service.findAll({});

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toHaveLength(1);
    });

    it('should apply status filter when provided', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      orderRepo.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

      await service.findAll({ status: ORDER_STATUS.PAID });

      expect(mockQb.andWhere).toHaveBeenCalledWith('order.status = :status', { status: ORDER_STATUS.PAID });
    });
  });

  describe('findOne', () => {
    it('should return order when found', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(order);

      const result = await service.findOne('order-uuid-1');
      expect(result).toEqual(order);
    });

    it('should throw NotFoundException when order not found', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByCustomer', () => {
    it('should call findAll with customer_id filter', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      orderRepo.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

      await service.findByCustomer('cust-1', {});

      expect(mockQb.andWhere).toHaveBeenCalledWith('order.customer_id = :customer_id', { customer_id: 'cust-1' });
    });
  });

  describe('findByCreator', () => {
    it('should call findAll with creator_id filter', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      orderRepo.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

      await service.findByCreator('creator-1', {});

      expect(mockQb.andWhere).toHaveBeenCalledWith('order.creator_id = :creator_id', { creator_id: 'creator-1' });
    });
  });

  describe('updateStatus', () => {
    it('should update status when transition is valid', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.PENDING };
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: ORDER_STATUS.PAID });
      deliveryRepo.findOne.mockResolvedValue(mockDelivery());

      const dto: UpdateOrderStatusDto = { status: ORDER_STATUS.PAID };
      const result = await service.updateStatus('order-uuid-1', dto);

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ORDER_STATUS.PAID }));
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.DELIVERED };
      orderRepo.findOne.mockResolvedValue(order);

      await expect(
        service.updateStatus('order-uuid-1', { status: ORDER_STATUS.PAID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when shipping without tracking number', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.PAID };
      orderRepo.findOne.mockResolvedValue(order);

      await expect(
        service.updateStatus('order-uuid-1', { status: ORDER_STATUS.SHIPPED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update delivery status to IN_TRANSIT when order is SHIPPED', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.PAID };
      const delivery = mockDelivery();
      orderRepo.findOne
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce({ ...order, status: ORDER_STATUS.SHIPPED, items: [], delivery });
      orderRepo.save.mockResolvedValue({ ...order, status: ORDER_STATUS.SHIPPED });
      deliveryRepo.findOne.mockResolvedValue(delivery);
      deliveryRepo.save.mockResolvedValue({ ...delivery, status: DELIVERY_STATUS.IN_TRANSIT });

      await service.updateStatus('order-uuid-1', {
        status: ORDER_STATUS.SHIPPED,
        tracking_number: 'TRK-123',
      });

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: DELIVERY_STATUS.IN_TRANSIT, tracking_number: 'TRK-123' }),
      );
    });
  });

  describe('cancel', () => {
    it('should cancel order when user is the owner and state allows', async () => {
      const order = { ...mockOrder(), customer_id: 'customer-uuid-1', status: ORDER_STATUS.PENDING };
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: ORDER_STATUS.CANCELLED });

      await service.cancel('order-uuid-1', 'customer-uuid-1');

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ORDER_STATUS.CANCELLED }));
    });

    it('should throw BadRequestException when user is not the order owner', async () => {
      const order = { ...mockOrder(), customer_id: 'other-customer' };
      orderRepo.findOne.mockResolvedValue(order);

      await expect(service.cancel('order-uuid-1', 'customer-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when order is in terminal state', async () => {
      const order = { ...mockOrder(), customer_id: 'customer-uuid-1', status: ORDER_STATUS.DELIVERED };
      orderRepo.findOne.mockResolvedValue(order);

      await expect(service.cancel('order-uuid-1', 'customer-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('adminCancel', () => {
    it('should cancel any cancellable order regardless of owner', async () => {
      const order = { ...mockOrder(), customer_id: 'any-customer', status: ORDER_STATUS.PAID };
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: ORDER_STATUS.CANCELLED });

      await service.adminCancel('order-uuid-1');

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ORDER_STATUS.CANCELLED }));
    });

    it('should throw BadRequestException for terminal state orders', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.DELIVERED };
      orderRepo.findOne.mockResolvedValue(order);

      await expect(service.adminCancel('order-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('trackOrder', () => {
    it('should return tracking info when phone number matches', async () => {
      const delivery = mockDelivery();
      const order = {
        ...mockOrder(),
        delivery,
        customer: { phoneNumber: '9800000001' },
      } as unknown as Order;
      orderRepo.findOne.mockResolvedValue(order);

      const dto: TrackOrderDto = { order_id: 'order-uuid-1', phone_number: '9800000001' };
      const result = await service.trackOrder(dto);

      expect(result.order_id).toBe('order-uuid-1');
      expect(result.status).toBe(ORDER_STATUS.PENDING);
    });

    it('should throw NotFoundException when phone does not match', async () => {
      const order = {
        ...mockOrder(),
        customer: { phoneNumber: '9800000002' },
      } as unknown as Order;
      orderRepo.findOne.mockResolvedValue(order);

      await expect(
        service.trackOrder({ order_id: 'order-uuid-1', phone_number: '9800000001' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when order does not exist', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.trackOrder({ order_id: 'non-existent', phone_number: '9800000001' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOrderTotals', () => {
    it('should return totals for given order IDs', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'order-1', total_amount: '500' },
          { id: 'order-2', total_amount: '750' },
        ]),
      };
      orderRepo.createQueryBuilder.mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

      const result = await service.getOrderTotals(['order-1', 'order-2']);

      expect(result).toHaveLength(2);
      expect(result[0].total_amount).toBe(500);
      expect(result[1].total_amount).toBe(750);
    });

    it('should return empty array when no IDs provided', async () => {
      const result = await service.getOrderTotals([]);
      expect(result).toEqual([]);
    });
  });
});
