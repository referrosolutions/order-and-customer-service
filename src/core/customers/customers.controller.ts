import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto, FindOrCreateCustomerDto, CustomerAutofillDto } from './dto';
import { IsCreatorGuard } from '../guards';

@ApiTags('customers')
@Controller('v1/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('autofill')
  @ApiOperation({
    summary: 'Get existing customer data for checkout auto-fill (public)',
    description:
      'Decodes the OTP verification token (from POST /v1/auth/otp/verify with purpose=checkout) and returns the matching customer if found. Returns null customer for new phone numbers.',
  })
  @ApiResponse({ status: 201, description: 'Customer data returned (null if not found)' })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP verification token' })
  autofill(@Body() dto: CustomerAutofillDto) {
    return this.customersService.autofill(dto.otp_verification_token).then((customer) => ({ customer }));
  }

  @Post('init-guest')
  @ApiOperation({
    summary: 'Initialize customer stub after OTP verification (public)',
    description:
      'Decodes the OTP verification token and creates a stub customer row if none exists for the phone number. Idempotent — returns existing customer if already created. Enables early retargeting before checkout is completed.',
  })
  @ApiResponse({ status: 201, description: 'Customer stub initialized or existing customer returned' })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP verification token' })
  initGuest(@Body() dto: CustomerAutofillDto) {
    return this.customersService.initFromOtp(dto.otp_verification_token);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 409, description: 'Phone number already exists' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Post('find-or-create')
  @ApiOperation({ summary: 'Find customer by phone or create new' })
  @ApiResponse({ status: 200, description: 'Customer found or created' })
  findOrCreate(@Body() dto: FindOrCreateCustomerDto) {
    return this.customersService.findOrCreate(dto);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Get('creator/me')
  @ApiOperation({
    summary: "Get customers who ordered through this creator's affiliate links",
    description: 'Returns paginated list of customers attributed to the authenticated creator via affiliate orders.',
  })
  @ApiResponse({ status: 200, description: 'Customers retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Creator only' })
  findMyCustomers(
    @Req() req: Request,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.customersService.findByCreator(req.user!.id, page, limit);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Get()
  @ApiOperation({ summary: 'Get all customers (paginated)' })
  @ApiResponse({ status: 200, description: 'Customers retrieved successfully' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.customersService.findAll(page, limit);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Get('phone/:phoneNumber')
  @ApiOperation({ summary: 'Get customer by phone number' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  findByPhone(@Param('phoneNumber') phoneNumber: string) {
    return this.customersService.findByPhone(phoneNumber);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Get(':id/orders')
  @ApiOperation({ summary: 'Get customer order history' })
  @ApiResponse({ status: 200, description: 'Order history retrieved' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  getOrderHistory(@Param('id') id: string) {
    return this.customersService.getOrderHistory(id);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Put(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 409, description: 'Phone number already exists' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(IsCreatorGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete customer' })
  @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  delete(@Param('id') id: string) {
    return this.customersService.delete(id);
  }
}
