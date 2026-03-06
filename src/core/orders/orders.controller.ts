import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';
import { USER_TYPE } from '../enums';
import { IsAdminGuard, IsCreatorGuard, IsVendorGuard, IsVendorOrAdminGuard } from '../guards';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('v1/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(@Req() req: Request, @Body() dto: CreateOrderDto) {
    const sessionId = req.cookies?.session_id as string | undefined;
    return this.ordersService.create(dto, req.user!, sessionId);
  }

  @Post('create')
  async createGuestOrder(@Req() req: Request, @Body() dto: CreateGuestOrderDto) {
    const sessionId = req.cookies?.session_id as string | undefined;
    return this.ordersService.createGuest(dto, sessionId);
  }

  @Get()
  @UseGuards(IsAdminGuard)
  async findAll(@Query() query: OrderQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get('me')
  async findMyOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
    const customerId = req.user!.id;
    return this.ordersService.findByCustomer(customerId, query);
  }

  @Get('vendor/me')
  @UseGuards(IsVendorGuard)
  async findVendorOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
    return this.ordersService.findByVendor(req.user!.id, query);
  }

  @Get('creator/me')
  @UseGuards(IsCreatorGuard)
  async findCreatorOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
    const creatorId = req.user!.id;
    return this.ordersService.findByCreator(creatorId, query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(IsVendorOrAdminGuard)
  async updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }

  @Post('internal/totals')
  async getInternalOrderTotals(
    @Headers('x-service-secret') serviceSecret: string,
    @Body() body: { order_ids: string[] },
  ) {
    const expectedSecret = process.env.INTERNAL_SERVICE_SECRET ?? '';
    if (!expectedSecret || serviceSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid service secret');
    }
    return this.ordersService.getOrderTotals(body.order_ids ?? []);
  }

  @Get('track/phone/:phoneNumber')
  async trackByPhone(@Param('phoneNumber') phoneNumber: string) {
    return this.ordersService.trackOrdersByPhone(phoneNumber);
  }

  @Post('track')
  async trackOrder(@Body() dto: TrackOrderDto) {
    return this.ordersService.trackOrder(dto);
  }

  @Delete(':id')
  async cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = req.user!.id;
    const userType = req.user!.user_type;

    if (userType === USER_TYPE.ADMIN) {
      return this.ordersService.adminCancel(id);
    }

    return this.ordersService.cancel(id, userId);
  }
}
