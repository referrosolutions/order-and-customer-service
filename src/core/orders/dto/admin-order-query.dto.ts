import { IsEnum, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ORDER_STATUS } from 'src/core/enums';

export class AdminOrderQueryDto {
  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsUUID()
  @IsOptional()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'Filter by creator ID (affiliate)' })
  @IsUUID()
  @IsOptional()
  creator_id?: string;

  @ApiPropertyOptional({ description: 'Filter by vendor ID' })
  @IsUUID()
  @IsOptional()
  vendor_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by order status',
    enum: ORDER_STATUS,
  })
  @IsEnum(ORDER_STATUS)
  @IsOptional()
  status?: ORDER_STATUS;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    maximum: 100,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
