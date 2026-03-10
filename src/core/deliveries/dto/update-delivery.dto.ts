import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DELIVERY_STATUS } from 'src/core/enums';

export class UpdateDeliveryDto {
  @ApiPropertyOptional({ description: 'Tracking number' })
  @IsString()
  @IsOptional()
  tracking_number?: string;

  @ApiPropertyOptional({ description: 'Tracking URL' })
  @IsString()
  @IsOptional()
  tracking_url?: string;

  @ApiPropertyOptional({ description: 'Delivery method or courier name' })
  @IsString()
  @IsOptional()
  delivery_method?: string;

  @ApiPropertyOptional({
    description: 'Delivery status',
    enum: DELIVERY_STATUS,
  })
  @IsEnum(DELIVERY_STATUS)
  @IsOptional()
  status?: DELIVERY_STATUS;
}
