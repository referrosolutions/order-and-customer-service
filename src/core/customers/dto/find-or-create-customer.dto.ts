import { IsString, IsNotEmpty, IsOptional, IsObject, ValidateNested, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class AddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;
}

export class FindOrCreateCustomerDto {
  @ApiProperty({ description: 'Customer phone number (unique identifier)' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 20)
  phoneNumber: string;

  @ApiProperty({ description: 'Customer name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Customer address' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiPropertyOptional({ description: 'Link to auth-service user ID' })
  @IsOptional()
  @IsString()
  userId?: string;
}
