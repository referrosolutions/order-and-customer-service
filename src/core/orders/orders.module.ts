import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from 'src/entity/order.entity';
import { OrderItem } from 'src/entity/order-item.entity';
import { CustomersModule } from '../customers/customers.module';
import { AuthClient } from 'src/utils/auth.client';
import { NotificationClient } from 'src/utils/notification.client';
import { DeliveryModule } from '../deliveries/delivery.module';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem]), CustomersModule, DeliveryModule, CommissionsModule],
  controllers: [OrdersController],
  providers: [OrdersService, NotificationClient, AuthClient],
  exports: [OrdersService],
})
export class OrdersModule {}
