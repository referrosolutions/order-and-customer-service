import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Headers,
  ParseUUIDPipe,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { IsAdminGuard, IsVendorGuard, IsCreatorGuard } from '../guards';
import { USER_TYPE } from '../enums';

@ApiTags('Orders')
@Controller('v1/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@Req() req: Request, @Body() dto: CreateOrderDto) {
    const customerId = req.user!.id;
    return this.ordersService.create(customerId, dto);
  }

  @Post('guest')
  @ApiOperation({ summary: 'Guest checkout - no authentication required (P0)' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createGuestOrder(@Body() dto: CreateGuestOrderDto) {
    return this.ordersService.createGuestOrder(dto);
  }

  @Get()
  @UseGuards(IsAdminGuard)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List all orders (Admin only)' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async findAll(@Query() query: OrderQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get current user orders (Customer)' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findMyOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
    const customerId = req.user!.id;
    return this.ordersService.findByCustomer(customerId, query);
  }

  @Get('vendor/me')
  @UseGuards(IsVendorGuard)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get orders for vendor products' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Vendor only' })
  async findVendorOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
    return this.ordersService.findByVendor(req.user!.id, query);
  }

  @Get('creator/me')
  @UseGuards(IsCreatorGuard)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get orders attributed to creator' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Creator only' })
  async findCreatorOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
    const creatorId = req.user!.id;
    return this.ordersService.findByCreator(creatorId, query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Update order status (Vendor/Admin)' })
  @ApiResponse({ status: 200, description: 'Order status updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    // Allow vendor or admin to update status
    const userType = req.user!.user_type;
    if (userType !== USER_TYPE.VENDOR && userType !== USER_TYPE.ADMIN) {
      throw new ForbiddenException('Only vendors or admins can update order status');
    }
    return this.ordersService.updateStatus(id, dto);
  }

  @Post('internal/totals')
  @ApiExcludeEndpoint()
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

  @Post('track')
  @ApiOperation({ summary: 'Track order (Public - requires order ID and phone)' })
  @ApiResponse({ status: 200, description: 'Order tracking info retrieved' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async trackOrder(@Body() dto: TrackOrderDto) {
    return this.ordersService.trackOrder(dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Cancel order (Owner/Admin)' })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel order' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = req.user!.id;
    const userType = req.user!.user_type;

    if (userType === USER_TYPE.ADMIN) {
      return this.ordersService.adminCancel(id);
    }

    return this.ordersService.cancel(id, userId);
  }
}
