import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Delivery } from 'src/entity/delivery.entity';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { handleServiceError } from 'src/utils/error';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
  ) {}

  async create(orderId: string, deliveryCharge: number): Promise<Delivery> {
    try {
      const delivery = this.deliveryRepo.create({
        order_id: orderId,
        delivery_charge: deliveryCharge,
      });
      return await this.deliveryRepo.save(delivery);
    } catch (error) {
      handleServiceError(error, 'Failed to create delivery record', DeliveryService.name);
    }
  }

  async findByOrderId(orderId: string): Promise<Delivery> {
    try {
      const delivery = await this.deliveryRepo.findOne({
        where: { order_id: orderId },
      });

      if (!delivery) {
        throw new NotFoundException(`Delivery record not found for order ${orderId}`);
      }

      return delivery;
    } catch (error) {
      handleServiceError(error, 'Failed to get delivery record', DeliveryService.name);
    }
  }

  async findByOrderIds(orderIds: string[]): Promise<Delivery[]> {
    if (orderIds.length === 0) return [];
    return this.deliveryRepo.find({ where: { order_id: In(orderIds) } });
  }

  async update(orderId: string, dto: UpdateDeliveryDto): Promise<Delivery> {
    try {
      const delivery = await this.findByOrderId(orderId);

      if (dto.tracking_number !== undefined) delivery.tracking_number = dto.tracking_number;
      if (dto.tracking_url !== undefined) delivery.tracking_url = dto.tracking_url;
      if (dto.delivery_method !== undefined) delivery.delivery_method = dto.delivery_method;
      if (dto.status !== undefined) delivery.status = dto.status;

      return await this.deliveryRepo.save(delivery);
    } catch (error) {
      handleServiceError(error, 'Failed to update delivery record', DeliveryService.name);
    }
  }
}
