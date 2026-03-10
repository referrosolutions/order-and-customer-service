import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { IsVendorOrAdminGuard } from '../guards/isVendorOrAdmin.guard';

@ApiTags('Delivery')
@ApiBearerAuth()
@ApiCookieAuth('accessToken')
@Controller('v1/delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @ApiOperation({ summary: 'Get delivery record for an order' })
  @ApiResponse({ status: 200, description: 'Returns delivery record' })
  @ApiResponse({ status: 404, description: 'Delivery record not found' })
  @Get(':orderId')
  findByOrderId(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.deliveryService.findByOrderId(orderId);
  }

  @ApiOperation({ summary: 'Update delivery tracking info (Vendor/Admin only)' })
  @ApiResponse({ status: 200, description: 'Delivery record updated' })
  @ApiResponse({ status: 404, description: 'Delivery record not found' })
  @UseGuards(IsVendorOrAdminGuard)
  @Patch(':orderId')
  update(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: UpdateDeliveryDto,
  ) {
    return this.deliveryService.update(orderId, dto);
  }
}
