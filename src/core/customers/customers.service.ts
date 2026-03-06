import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Customer } from '../../entity/customer.entity';
import { Order } from '../../entity/order.entity';
import { CreateCustomerDto, UpdateCustomerDto, FindOrCreateCustomerDto } from './dto';
import { CustomerOrderHistoryResponse } from '../../types';
import { handleServiceError } from '../../utils/error';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly jwtService: JwtService,
  ) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const existing = await this.customerRepository.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (existing) {
      throw new ConflictException(`Customer with phone ${dto.phoneNumber} already exists`);
    }

    const customer = this.customerRepository.create(dto);
    return await this.customerRepository.save(customer);
  }

  async findOrCreate(dto: FindOrCreateCustomerDto): Promise<Customer> {
    let customer = await this.customerRepository.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (customer) {
      const hasChanges =
        customer.name !== dto.name ||
        JSON.stringify(customer.address) !== JSON.stringify(dto.address) ||
        (dto.userId && customer.userId !== dto.userId);

      if (hasChanges) {
        customer = await this.update(customer.id, {
          name: dto.name,
          address: dto.address,
          userId: dto.userId,
        });
      }

      return customer;
    }

    customer = this.customerRepository.create(dto);
    return await this.customerRepository.save(customer);
  }

  async findByCreator(
    creatorId: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: Customer[]; total: number; page: number; limit: number }> {
    try {
      const subQuery = this.orderRepository
        .createQueryBuilder('order')
        .select('DISTINCT order.customer_id')
        .where('order.creator_id = :creatorId', { creatorId });

      const [data, total] = await this.customerRepository
        .createQueryBuilder('customer')
        .where(`customer.id IN (${subQuery.getQuery()})`)
        .setParameters(subQuery.getParameters())
        .orderBy('customer.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return { data, total, page, limit };
    } catch (error) {
      handleServiceError(error, 'Failed to get creator customers', 'CustomersService');
    }
  }

  async findAll(page = 1, limit = 10): Promise<{ data: Customer[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.customerRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: ['orders'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  async findByPhone(phoneNumber: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { phoneNumber },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with phone ${phoneNumber} not found`);
    }

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    try {
      const customer = await this.findOne(id);

      if (dto.phoneNumber && dto.phoneNumber !== customer.phoneNumber) {
        const existing = await this.customerRepository.findOne({
          where: { phoneNumber: dto.phoneNumber },
        });

        if (existing) {
          throw new ConflictException(`Customer with phone ${dto.phoneNumber} already exists`);
        }
      }

      Object.assign(customer, dto);
      return await this.customerRepository.save(customer);
    } catch (error) {
      handleServiceError(error, 'Failed to update customer', 'CustomersService');
    }
  }

  async getOrderHistory(id: string): Promise<CustomerOrderHistoryResponse> {
    try {
      const customer = await this.customerRepository.findOne({
        where: { id },
        relations: ['orders'],
      });

      if (!customer) {
        throw new NotFoundException(`Customer with ID ${id} not found`);
      }

      const totalOrders = customer.orders.length;
      const totalSpent = customer.orders.reduce((sum, order) => sum + Number(order.grand_total), 0);

      return {
        customerId: customer.id,
        totalOrders,
        totalSpent,
        orders: customer.orders,
      };
    } catch (error) {
      handleServiceError(error, 'Failed to get customer order history', 'CustomersService');
    }
  }

  async delete(id: string): Promise<void> {
    const customer = await this.findOne(id);
    await this.customerRepository.softDelete(customer.id);
  }

  async autofill(otp_verification_token: string): Promise<Customer | null> {
    let phone_number: string;

    try {
      const payload = await this.jwtService.verifyAsync<{ phone_number: string }>(
        otp_verification_token,
        { secret: process.env.JWT_SECRET },
      );
      phone_number = payload.phone_number;
    } catch {
      throw new UnauthorizedException('Invalid or expired OTP verification token');
    }

    const customer = await this.customerRepository.findOne({
      where: { phoneNumber: phone_number },
    });

    return customer ?? null;
  }

  async initFromOtp(otp_verification_token: string): Promise<Customer> {
    let phone_number: string;

    try {
      const payload = await this.jwtService.verifyAsync<{ phone_number: string }>(
        otp_verification_token,
        { secret: process.env.JWT_SECRET },
      );
      phone_number = payload.phone_number;
    } catch {
      throw new UnauthorizedException('Invalid or expired OTP verification token');
    }

    let customer = await this.customerRepository.findOne({
      where: { phoneNumber: phone_number },
    });

    if (!customer) {
      customer = this.customerRepository.create({
        phoneNumber: phone_number,
        name: 'Guest User',
        address: {},
      });
      await this.customerRepository.save(customer);
    }

    return customer;
  }
}
