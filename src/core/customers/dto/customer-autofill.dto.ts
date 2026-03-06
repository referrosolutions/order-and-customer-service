import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CustomerAutofillDto {
  @ApiProperty({
    description: 'JWT token returned from OTP verification (purpose: checkout)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  otp_verification_token: string;
}
