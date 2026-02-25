import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { Delivery } from 'src/entity/delivery.entity';
import { DELIVERY_STATUS } from 'src/core/enums';

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
  order: null as never,
}) as Delivery;

describe('DeliveryService', () => {
  let service: DeliveryService;
  let deliveryRepo: jest.Mocked<Repository<Delivery>>;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: getRepositoryToken(Delivery), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<DeliveryService>(DeliveryService);
    deliveryRepo = module.get(getRepositoryToken(Delivery));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByOrderId', () => {
    it('should return delivery when found', async () => {
      const delivery = mockDelivery();
      deliveryRepo.findOne.mockResolvedValue(delivery);

      const result = await service.findByOrderId('order-uuid-1');

      expect(result).toEqual(delivery);
      expect(deliveryRepo.findOne).toHaveBeenCalledWith({
        where: { order_id: 'order-uuid-1' },
      });
    });

    it('should throw NotFoundException when delivery not found', async () => {
      deliveryRepo.findOne.mockResolvedValue(null);

      await expect(service.findByOrderId('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update tracking_number only', async () => {
      const delivery = mockDelivery();
      const updated = { ...delivery, tracking_number: 'TRK-001' };
      deliveryRepo.findOne.mockResolvedValue(delivery);
      deliveryRepo.save.mockResolvedValue(updated);

      const result = await service.update('order-uuid-1', { tracking_number: 'TRK-001' });

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tracking_number: 'TRK-001' }),
      );
    });

    it('should update tracking_url only', async () => {
      const delivery = mockDelivery();
      deliveryRepo.findOne.mockResolvedValue(delivery);
      deliveryRepo.save.mockResolvedValue({ ...delivery, tracking_url: 'https://track.example.com/TRK-001' });

      await service.update('order-uuid-1', { tracking_url: 'https://track.example.com/TRK-001' });

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tracking_url: 'https://track.example.com/TRK-001' }),
      );
    });

    it('should update status only', async () => {
      const delivery = mockDelivery();
      deliveryRepo.findOne.mockResolvedValue(delivery);
      deliveryRepo.save.mockResolvedValue({ ...delivery, status: DELIVERY_STATUS.IN_TRANSIT });

      await service.update('order-uuid-1', { status: DELIVERY_STATUS.IN_TRANSIT });

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: DELIVERY_STATUS.IN_TRANSIT }),
      );
    });

    it('should update all fields at once', async () => {
      const delivery = mockDelivery();
      deliveryRepo.findOne.mockResolvedValue(delivery);
      deliveryRepo.save.mockResolvedValue({
        ...delivery,
        tracking_number: 'TRK-999',
        tracking_url: 'https://track.example.com/TRK-999',
        status: DELIVERY_STATUS.IN_TRANSIT,
      });

      const result = await service.update('order-uuid-1', {
        tracking_number: 'TRK-999',
        tracking_url: 'https://track.example.com/TRK-999',
        status: DELIVERY_STATUS.IN_TRANSIT,
      });

      expect(deliveryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tracking_number: 'TRK-999',
          tracking_url: 'https://track.example.com/TRK-999',
          status: DELIVERY_STATUS.IN_TRANSIT,
        }),
      );
    });

    it('should throw NotFoundException when delivery for order not found', async () => {
      deliveryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { tracking_number: 'TRK-000' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
