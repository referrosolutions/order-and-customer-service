import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Customer } from 'src/entity/customer.entity';
import { ORDER_STATUS, PAYMENT_METHOD } from 'src/core/enums';
import type { Order } from 'src/entity/order.entity';

const mockCustomer = (): Customer => ({
  id: 'customer-uuid-1',
  name: 'John Doe',
  phoneNumber: '9800000001',
  address: { street: '123 Main St', city: 'Kathmandu' },
  userId: undefined,
  orders: [],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: undefined,
}) as Customer;

const mockOrder = (): Order => ({
  id: 'order-uuid-1',
  customer_id: 'customer-uuid-1',
  creator_id: null,
  payment_method: PAYMENT_METHOD.COD,
  total_amount: 500,
  status: ORDER_STATUS.PENDING,
  items: [],
  delivery: null,
  customer: null,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
}) as unknown as Order;

describe('CustomersService', () => {
  let service: CustomersService;
  let customerRepo: jest.Mocked<Repository<Customer>>;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      findAndCount: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Customer), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
    customerRepo = module.get(getRepositoryToken(Customer));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and return a customer', async () => {
      const dto = { name: 'Jane Doe', phoneNumber: '9800000002', address: { street: '456 Oak Ave', city: 'Pokhara' } };
      const customer = { ...mockCustomer(), ...dto };

      customerRepo.findOne.mockResolvedValue(null);
      customerRepo.create.mockReturnValue(customer);
      customerRepo.save.mockResolvedValue(customer);

      const result = await service.create(dto);

      expect(result).toEqual(customer);
    });

    it('should throw ConflictException when phone already exists', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer());

      await expect(service.create({ name: 'Dup', phoneNumber: '9800000001', address: { city: 'Kathmandu' } })).rejects.toThrow(ConflictException);
    });
  });

  describe('findOrCreate', () => {
    it('should return existing customer unchanged when no data changes', async () => {
      const customer = mockCustomer();
      customerRepo.findOne.mockResolvedValue(customer);

      const result = await service.findOrCreate({
        phoneNumber: customer.phoneNumber,
        name: customer.name,
        address: customer.address,
      });

      expect(result).toEqual(customer);
      expect(customerRepo.save).not.toHaveBeenCalled();
    });

    it('should update existing customer when data has changed', async () => {
      const customer = mockCustomer();
      const updated = { ...customer, name: 'Updated Name' };
      customerRepo.findOne
        .mockResolvedValueOnce(customer)
        .mockResolvedValueOnce(customer);
      customerRepo.save.mockResolvedValue(updated);

      await service.findOrCreate({
        phoneNumber: customer.phoneNumber,
        name: 'Updated Name',
        address: customer.address,
      });

      expect(customerRepo.save).toHaveBeenCalled();
    });

    it('should create new customer when phone not found', async () => {
      const newCustomer = { ...mockCustomer(), phoneNumber: '9800000099' };
      customerRepo.findOne.mockResolvedValue(null);
      customerRepo.create.mockReturnValue(newCustomer);
      customerRepo.save.mockResolvedValue(newCustomer);

      await service.findOrCreate({ phoneNumber: '9800000099', name: 'New Guest', address: { city: 'Lalitpur' } });

      expect(customerRepo.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated customers', async () => {
      const customers = [mockCustomer(), mockCustomer()];
      customerRepo.findAndCount.mockResolvedValue([customers, 2]);

      const result = await service.findAll(1, 10);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return customer with orders', async () => {
      const customer = mockCustomer();
      customerRepo.findOne.mockResolvedValue(customer);

      const result = await service.findOne('customer-uuid-1');
      expect(result).toEqual(customer);
      expect(customerRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'customer-uuid-1' },
        relations: ['orders'],
      });
    });

    it('should throw NotFoundException when customer not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPhone', () => {
    it('should return customer when phone matches', async () => {
      const customer = mockCustomer();
      customerRepo.findOne.mockResolvedValue(customer);

      const result = await service.findByPhone('9800000001');
      expect(result).toEqual(customer);
    });

    it('should throw NotFoundException when phone not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      await expect(service.findByPhone('0000000000')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update customer fields and return updated customer', async () => {
      const customer = mockCustomer();
      const updated = { ...customer, name: 'New Name' };

      customerRepo.findOne.mockResolvedValue(customer);
      customerRepo.save.mockResolvedValue(updated);

      const result = await service.update('customer-uuid-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
    });

    it('should throw ConflictException when updating to an existing phone', async () => {
      const customer = mockCustomer();
      const conflicting = { ...mockCustomer(), id: 'other-id', phoneNumber: '9800000002' };

      customerRepo.findOne
        .mockResolvedValueOnce(customer)
        .mockResolvedValueOnce(conflicting);

      await expect(
        service.update('customer-uuid-1', { phoneNumber: '9800000002' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getOrderHistory', () => {
    it('should return typed order history with correct totals', async () => {
      const orders = [
        { ...mockOrder(), total_amount: 300 },
        { ...mockOrder(), total_amount: 700 },
      ];
      const customer = { ...mockCustomer(), orders };
      customerRepo.findOne.mockResolvedValue(customer);

      const result = await service.getOrderHistory('customer-uuid-1');

      expect(result.customerId).toBe('customer-uuid-1');
      expect(result.totalOrders).toBe(2);
      expect(result.totalSpent).toBe(1000);
      expect(result.orders).toHaveLength(2);
    });

    it('should throw NotFoundException when customer not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      await expect(service.getOrderHistory('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should soft delete customer', async () => {
      const customer = mockCustomer();
      customerRepo.findOne.mockResolvedValue(customer);
      customerRepo.softDelete.mockResolvedValue({ affected: 1 } as never);

      await service.delete('customer-uuid-1');

      expect(customerRepo.softDelete).toHaveBeenCalledWith('customer-uuid-1');
    });

    it('should throw NotFoundException when customer not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
