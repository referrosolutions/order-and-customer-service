import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMinSize,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_METHOD } from 'src/core/enums';
import { CreateOrderItemDto, ShippingAddressDto } from './create-order.dto';

export class GuestCustomerDto {
  @ApiProperty({ description: 'Customer full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Customer phone number (used for order tracking)' })
  @IsString()
  @IsNotEmpty()
  @Length(7, 20)
  phone_number: string;

  @ApiPropertyOptional({ description: 'Customer email (optional)' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'Delivery address' })
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  address: ShippingAddressDto;
}

export class CreateGuestOrderDto {
  @ApiProperty({ description: 'Guest customer info', type: GuestCustomerDto })
  @ValidateNested()
  @Type(() => GuestCustomerDto)
  customer: GuestCustomerDto;

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

}
