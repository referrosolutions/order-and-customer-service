import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { IsVendorGuard } from '../guards';

@ApiTags('Delivery')
@Controller('v1/delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get(':orderId')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get delivery info for an order' })
  @ApiResponse({
    status: 200,
    description: 'Delivery info retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Delivery not found' })
  async findByOrderId(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.deliveryService.findByOrderId(orderId);
  }

  @Patch(':orderId')
  @UseGuards(IsVendorGuard)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Update delivery info (Vendor only)' })
  @ApiResponse({
    status: 200,
    description: 'Delivery info updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Vendor only' })
  @ApiResponse({ status: 404, description: 'Delivery not found' })
  async update(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: UpdateDeliveryDto,
  ) {
    return this.deliveryService.update(orderId, dto);
  }
}
