import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORDER_STATUS } from 'src/core/enums';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    enum: ORDER_STATUS,
    example: ORDER_STATUS.SHIPPED,
  })
  @IsEnum(ORDER_STATUS)
  @IsNotEmpty()
  status: ORDER_STATUS;

  @ApiPropertyOptional({ description: 'Tracking number (required when status is shipped)' })
  @IsOptional()
  @IsString()
  tracking_number?: string;

  @ApiPropertyOptional({ description: 'Tracking URL for the shipment' })
  @IsOptional()
  @IsString()
  tracking_url?: string;

  @ApiPropertyOptional({ description: 'Delivery method / courier name' })
  @IsOptional()
  @IsString()
  delivery_method?: string;
}
