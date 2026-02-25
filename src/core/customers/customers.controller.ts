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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto, FindOrCreateCustomerDto } from './dto';
import { IsCreatorGuard } from '../guards';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(IsCreatorGuard)
@Controller('v1/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 409, description: 'Phone number already exists' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Post('find-or-create')
  @ApiOperation({ summary: 'Find customer by phone or create new' })
  @ApiResponse({ status: 200, description: 'Customer found or created' })
  findOrCreate(@Body() dto: FindOrCreateCustomerDto) {
    return this.customersService.findOrCreate(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all customers (paginated)' })
  @ApiResponse({ status: 200, description: 'Customers retrieved successfully' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.customersService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Get('phone/:phoneNumber')
  @ApiOperation({ summary: 'Get customer by phone number' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  findByPhone(@Param('phoneNumber') phoneNumber: string) {
    return this.customersService.findByPhone(phoneNumber);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Get customer order history' })
  @ApiResponse({ status: 200, description: 'Order history retrieved' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  getOrderHistory(@Param('id') id: string) {
    return this.customersService.getOrderHistory(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 409, description: 'Phone number already exists' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete customer' })
  @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  delete(@Param('id') id: string) {
    return this.customersService.delete(id);
  }
}
