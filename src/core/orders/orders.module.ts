import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from 'src/entity/order.entity';
import { OrderItem } from 'src/entity/order-item.entity';
import { CustomersModule } from '../customers/customers.module';
import { NotificationClient } from 'src/utils/notification.client';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem]), CustomersModule],
  controllers: [OrdersController],
  providers: [OrdersService, NotificationClient],
  exports: [OrdersService],
})
export class OrdersModule {}
