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

  @ApiPropertyOptional({
    description: 'Tracking number (required when shipping)',
  })
  @IsString()
  @IsOptional()
  tracking_number?: string;

  @ApiPropertyOptional({ description: 'Tracking URL' })
  @IsString()
  @IsOptional()
  tracking_url?: string;
}
