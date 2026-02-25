import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from 'src/entity/delivery.entity';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { handleServiceError } from 'src/utils/error';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
  ) {}

  async findByOrderId(orderId: string): Promise<Delivery> {
    try {
      const delivery = await this.deliveryRepo.findOne({
        where: { order_id: orderId },
      });

      if (!delivery) {
        throw new NotFoundException(
          `Delivery for order ${orderId} not found`,
        );
      }

      return delivery;
    } catch (error) {
      handleServiceError(
        error,
        'Failed to fetch delivery info',
        'DeliveryService',
      );
    }
  }

  async update(orderId: string, dto: UpdateDeliveryDto): Promise<Delivery> {
    try {
      const delivery = await this.findByOrderId(orderId);

      if (dto.tracking_number !== undefined) {
        delivery.tracking_number = dto.tracking_number;
      }
      if (dto.tracking_url !== undefined) {
        delivery.tracking_url = dto.tracking_url;
      }
      if (dto.status !== undefined) {
        delivery.status = dto.status;
      }

      await this.deliveryRepo.save(delivery);

      return delivery;
    } catch (error) {
      handleServiceError(
        error,
        'Failed to update delivery info',
        'DeliveryService',
      );
    }
  }
}
