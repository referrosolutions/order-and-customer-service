import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { IsAuthMiddleware } from './core/middleware/isAuth.middleware';
import { HealthModule } from './core/health/health.module';
import { OrdersModule } from './core/orders/orders.module';
import { DeliveryModule } from './core/delivery/delivery.module';
import { CustomersModule } from './core/customers/customers.module';

import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { LoggerModule } from 'pino-nestjs';
import { Request, Response } from 'express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entity/order.entity';
import { OrderItem } from './entity/order-item.entity';
import { Delivery } from './entity/delivery.entity';
import { Customer } from './entity/customer.entity';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      validate,
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        serializers: {
          req: (req: Request) => ({
            method: req.method,
            url: req.url,
            query: req.query,
            params: req.params,
            origin: req.headers.origin,
          }),
          res: (res: Response) => ({
            statusCode: res.statusCode,
          }),
        },
        // Pretty print in dev, JSON in prod
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        // Redact sensitive data
        redact: ['req.headers.authorization'],
      },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? ''),
      username: process.env.DATABASE_USERNAME,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [Order, OrderItem, Delivery, Customer],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: false,
      ssl: {
        rejectUnauthorized: false,
      },
    }),
    JwtModule.register({}),

    HealthModule,
    CustomersModule,
    OrdersModule,
    DeliveryModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(IsAuthMiddleware)
      .exclude(
        { path: 'v1/orders/track', method: RequestMethod.POST },
        { path: 'v1/orders/guest', method: RequestMethod.POST },
        { path: 'v1/orders/internal/totals', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
