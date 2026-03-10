import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
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

export class ShippingAddressDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  street?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  country?: string;
}

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @ApiProperty({ description: 'Product variant ID' })
  @IsUUID()
  @IsNotEmpty()
  variant_id: string;

  @ApiProperty({ description: 'Vendor ID (product owner)' })
  @IsUUID()
  @IsNotEmpty()
  vendor_id: string;

  @ApiProperty({ description: 'Quantity', minimum: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ description: 'Unit price at time of order' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unit_price: number;

  @ApiPropertyOptional({ description: 'Product name (used for notifications and display)' })
  @IsString()
  @IsOptional()
  product_name?: string;

  @ApiPropertyOptional({ description: 'Product image URL for the ordered variant (variant image preferred, else primary)' })
  @IsString()
  @IsOptional()
  product_image?: string;

  @ApiPropertyOptional({ description: 'Variant label (e.g. "Red / XL" derived from attributes)' })
  @IsString()
  @IsOptional()
  variant_label?: string;
}

export class CreateOrderDto {
  @ApiProperty({
    description: 'Order items (at least one required)',
    type: [CreateOrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @ArrayMinSize(1, { message: 'At least one order item is required' })
  items: CreateOrderItemDto[];

  @ApiProperty({
    description: 'Payment method',
    enum: PAYMENT_METHOD,
    example: PAYMENT_METHOD.COD,
  })
  @IsEnum(PAYMENT_METHOD)
  @IsNotEmpty()
  payment_method: PAYMENT_METHOD;

  @ApiPropertyOptional({ description: 'Delivery fee', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  delivery_fee?: number;

  @ApiPropertyOptional({ description: 'Discount amount', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount_amount?: number;

  @ApiPropertyOptional({ description: 'Shipping address (overrides customer default)' })
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  @IsOptional()
  shipping_address?: ShippingAddressDto;

}
