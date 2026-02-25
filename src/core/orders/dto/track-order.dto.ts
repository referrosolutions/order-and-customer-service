import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TrackOrderDto {
  @ApiProperty({ description: 'Order ID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  order_id: string;

  @ApiProperty({ description: 'Customer phone number for verification' })
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}
