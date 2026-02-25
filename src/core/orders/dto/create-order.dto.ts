import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_METHOD } from 'src/core/enums';

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Product variant ID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  variant_id: string;

  @ApiProperty({ description: 'Quantity to order', minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Unit price at time of order' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unit_price: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description: 'Payment method',
    enum: PAYMENT_METHOD,
    example: PAYMENT_METHOD.COD,
  })
  @IsEnum(PAYMENT_METHOD)
  @IsNotEmpty()
  payment_method: PAYMENT_METHOD;

  @ApiPropertyOptional({
    description: 'Creator ID for affiliate attribution',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  creator_id?: string;

  @ApiProperty({
    description: 'Order items (at least one required)',
    type: [CreateOrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @ArrayMinSize(1, { message: 'At least one order item is required' })
  items: CreateOrderItemDto[];

  @ApiProperty({ description: 'Delivery method', example: 'standard' })
  @IsString()
  @IsNotEmpty()
  delivery_method: string;

  @ApiPropertyOptional({ description: 'Delivery charge', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  delivery_charge?: number;
}
