import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { NotificationClient } from 'src/utils/notification.client';
import { Order } from 'src/entity/order.entity';
import { OrderItem } from 'src/entity/order-item.entity';
import { CustomersService } from '../customers/customers.service';
import { ORDER_STATUS, PAYMENT_METHOD, USER_TYPE } from 'src/core/enums';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { JwtPayload } from 'src/types';

const mockUser = (): JwtPayload => ({
  id: 'user-uuid-1',
  name: 'Test User',
  phone_number: '9800000000',
  user_type: USER_TYPE.CREATOR,
});

const mockOrder = (): Order => ({
  id: 'order-uuid-1',
  customer_id: 'customer-uuid-1',
  store_id: null,
  creator_id: null,
  payment_method: PAYMENT_METHOD.COD,
  ispaid: false,
  subtotal: 900,
  delivery_fee: 100,
  discount_amount: 0,
  grand_total: 1000,
  status: ORDER_STATUS.PENDING,
  shipping_address: null,
  items: [],
  customer: null as unknown,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
}) as Order;

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepo: jest.Mocked<Pick<typeof import('typeorm').Repository.prototype, 'findOne' | 'save' | 'create' | 'createQueryBuilder' | 'find'>>;
  let dataSource: jest.Mocked<DataSource>;
  let customersService: jest.Mocked<CustomersService>;

  beforeEach(async () => {
    const mockOrderRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    };

    const mockOrderItemRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockDataSource = {
      transaction: jest.fn(),
    };

    const mockCustomersService = {
      findOrCreate: jest.fn(),
      findByPhone: jest.fn(),
    };

    const mockNotificationClient = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: mockOrderItemRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: NotificationClient, useValue: mockNotificationClient },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    orderRepo = module.get(getRepositoryToken(Order));
    dataSource = module.get(DataSource);
    customersService = module.get(CustomersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should calculate totals and create order with items in a transaction', async () => {
      const dto: CreateOrderDto = {
        payment_method: PAYMENT_METHOD.COD,
        items: [{ product_id: 'prod-1', variant_id: 'var-1', vendor_id: 'vendor-1', quantity: 2, unit_price: 400 }],
        delivery_fee: 100,
      };

      const savedOrder = { ...mockOrder() };

      customersService.findOrCreate.mockResolvedValue({ id: 'customer-uuid-1' } as ReturnType<typeof customersService.findOrCreate> extends Promise<infer T> ? T : never);

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => {
        const mgr = {
          create: jest.fn().mockReturnValueOnce(savedOrder).mockReturnValue({}),
          save: jest.fn().mockResolvedValueOnce(savedOrder).mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue({ ...savedOrder, items: [] }),
        };
        return cb(mgr);
      });

      const result = await service.create(dto, mockUser());

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should include delivery_fee in grand_total', async () => {
      const dto: CreateOrderDto = {
        payment_method: PAYMENT_METHOD.COD,
        items: [{ product_id: 'prod-1', variant_id: 'var-1', vendor_id: 'vendor-1', quantity: 1, unit_price: 500 }],
        delivery_fee: 200,
      };

      customersService.findOrCreate.mockResolvedValue({ id: 'customer-uuid-1' } as ReturnType<typeof customersService.findOrCreate> extends Promise<infer T> ? T : never);

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => {
        const mgr = {
          create: jest.fn((_, data) => ({ ...data })),
          save: jest.fn().mockResolvedValueOnce({ id: 'order-1', grand_total: 700 }).mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue({ id: 'order-1', grand_total: 700, items: [] }),
        };
        return cb(mgr);
      });

      const result = await service.create(dto, mockUser());
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
      (orderRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

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
      (orderRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

      await service.findAll({ status: ORDER_STATUS.PAID });

      expect(mockQb.andWhere).toHaveBeenCalledWith('order.status = :status', { status: ORDER_STATUS.PAID });
    });
  });

  describe('findOne', () => {
    it('should return order when found', async () => {
      const order = mockOrder();
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);

      const result = await service.findOne('order-uuid-1');
      expect(result).toEqual(order);
    });

    it('should throw NotFoundException when order not found', async () => {
      (orderRepo.findOne as jest.Mock).mockResolvedValue(null);

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
      (orderRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

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
      (orderRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

      await service.findByCreator('creator-1', {});

      expect(mockQb.andWhere).toHaveBeenCalledWith('order.creator_id = :creator_id', { creator_id: 'creator-1' });
    });
  });

  describe('updateStatus', () => {
    it('should update status when transition is valid', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.PENDING };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);
      (orderRepo.save as jest.Mock).mockResolvedValue({ ...order, status: ORDER_STATUS.PAID });

      const dto: UpdateOrderStatusDto = { status: ORDER_STATUS.PAID };
      await service.updateStatus('order-uuid-1', dto);

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ORDER_STATUS.PAID }));
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.DELIVERED };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);

      await expect(
        service.updateStatus('order-uuid-1', { status: ORDER_STATUS.PAID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set ispaid to true when status is PAID', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.PENDING };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);
      (orderRepo.save as jest.Mock).mockResolvedValue({ ...order, status: ORDER_STATUS.PAID, ispaid: true });

      await service.updateStatus('order-uuid-1', { status: ORDER_STATUS.PAID });

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ ispaid: true }));
    });
  });

  describe('cancel', () => {
    it('should cancel order when user is the owner and state allows', async () => {
      const order = { ...mockOrder(), customer_id: 'customer-uuid-1', status: ORDER_STATUS.PENDING };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);
      (orderRepo.save as jest.Mock).mockResolvedValue({ ...order, status: ORDER_STATUS.CANCELLED });

      await service.cancel('order-uuid-1', 'customer-uuid-1');

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ORDER_STATUS.CANCELLED }));
    });

    it('should throw BadRequestException when user is not the order owner', async () => {
      const order = { ...mockOrder(), customer_id: 'other-customer' };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);

      await expect(service.cancel('order-uuid-1', 'customer-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when order is in terminal state', async () => {
      const order = { ...mockOrder(), customer_id: 'customer-uuid-1', status: ORDER_STATUS.DELIVERED };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);

      await expect(service.cancel('order-uuid-1', 'customer-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('adminCancel', () => {
    it('should cancel any cancellable order regardless of owner', async () => {
      const order = { ...mockOrder(), customer_id: 'any-customer', status: ORDER_STATUS.PAID };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);
      (orderRepo.save as jest.Mock).mockResolvedValue({ ...order, status: ORDER_STATUS.CANCELLED });

      await service.adminCancel('order-uuid-1');

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ORDER_STATUS.CANCELLED }));
    });

    it('should throw BadRequestException for terminal state orders', async () => {
      const order = { ...mockOrder(), status: ORDER_STATUS.DELIVERED };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);

      await expect(service.adminCancel('order-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('trackOrder', () => {
    it('should return tracking info when phone number matches', async () => {
      const order = {
        ...mockOrder(),
        customer: { phoneNumber: '9800000001' },
      } as unknown as Order;
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);

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
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);

      await expect(
        service.trackOrder({ order_id: 'order-uuid-1', phone_number: '9800000001' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when order does not exist', async () => {
      (orderRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.trackOrder({ order_id: 'non-existent', phone_number: '9800000001' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOrderTotals', () => {
    it('should return grand_total for given order IDs', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'order-1', grand_total: '500' },
          { id: 'order-2', grand_total: '750' },
        ]),
      };
      (orderRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQb as unknown as SelectQueryBuilder<Order>);

      const result = await service.getOrderTotals(['order-1', 'order-2']);

      expect(result).toHaveLength(2);
      expect(result[0].grand_total).toBe(500);
      expect(result[1].grand_total).toBe(750);
    });

    it('should return empty array when no IDs provided', async () => {
      const result = await service.getOrderTotals([]);
      expect(result).toEqual([]);
    });
  });
});
