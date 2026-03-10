import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CommissionRecord } from 'src/entity/commission-record.entity';
import { OrderItem } from 'src/entity/order-item.entity';
import { COMMISSION_STATUS } from 'src/core/enums';
import { handleServiceError } from 'src/utils/error';

const PLATFORM_FEE_PERCENT = 5;
const COMMISSION_COOLDOWN_DAYS = 7;
const AFFILIATE_SERVICE_URL = process.env.AFFILIATE_SERVICE_URL ?? 'http://localhost:9003';

interface AffiliateCommissionData {
  commission_percent: number;
}

export interface CreatorCommissionSummary {
  total_earned: number;
  available_balance: number;
  in_escrow: number;
  total_paid: number;
  records: CommissionRecord[];
}

export interface VendorCommissionSummary {
  total_revenue: number;
  total_commissions_paid: number;
  total_platform_fees: number;
  net_revenue: number;
  records: CommissionRecord[];
}

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(
    @InjectRepository(CommissionRecord)
    private readonly commissionRepo: Repository<CommissionRecord>,
  ) {}

  private async fetchAffiliateCommission(affiliateId: string): Promise<number | null> {
    try {
      const res = await fetch(`${AFFILIATE_SERVICE_URL}/v1/affiliates/${affiliateId}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = (await res.json()) as AffiliateCommissionData;
        return data.commission_percent ?? null;
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch affiliate commission for ${affiliateId}: ${(err as Error).message}`);
    }
    return null;
  }

  async createFromOrderItems(items: OrderItem[]): Promise<void> {
    const eligibleItems = items.filter((item) => item.affiliate_id && item.creator_id);
    if (eligibleItems.length === 0) return;

    const records: Partial<CommissionRecord>[] = [];

    for (const item of eligibleItems) {
      const commissionPercent = await this.fetchAffiliateCommission(item.affiliate_id!);
      if (commissionPercent === null) {
        this.logger.warn(`Skipping commission for item ${item.id} — could not fetch commission rate`);
        continue;
      }

      const orderAmount = Number(item.total_price);
      const commissionAmount = (orderAmount * commissionPercent) / 100;
      const platformFee = (orderAmount * PLATFORM_FEE_PERCENT) / 100;
      const vendorNet = orderAmount - commissionAmount - platformFee;

      records.push({
        order_item_id: item.id,
        creator_id: item.creator_id,
        affiliate_id: item.affiliate_id,
        vendor_id: item.vendor_id,
        order_amount: orderAmount,
        commission_percent: commissionPercent,
        commission_amount: commissionAmount,
        platform_fee: platformFee,
        vendor_net: vendorNet,
        status: COMMISSION_STATUS.PENDING,
        available_at: null,
      });
    }

    if (records.length > 0) {
      await this.commissionRepo.save(records);
      this.logger.log(`Created ${records.length} commission records`);
    }
  }

  async moveToEscrow(orderItemIds: string[]): Promise<void> {
    if (orderItemIds.length === 0) return;
    await this.commissionRepo.update(
      { order_item_id: In(orderItemIds), status: COMMISSION_STATUS.PENDING },
      { status: COMMISSION_STATUS.IN_ESCROW },
    );
  }

  async releaseEscrow(orderItemIds: string[]): Promise<void> {
    if (orderItemIds.length === 0) return;
    const availableAt = new Date();
    availableAt.setDate(availableAt.getDate() + COMMISSION_COOLDOWN_DAYS);
    await this.commissionRepo.update(
      { order_item_id: In(orderItemIds), status: COMMISSION_STATUS.IN_ESCROW },
      { status: COMMISSION_STATUS.AVAILABLE, available_at: availableAt },
    );
  }

  async cancelByOrderItems(orderItemIds: string[]): Promise<void> {
    if (orderItemIds.length === 0) return;
    await this.commissionRepo.update(
      {
        order_item_id: In(orderItemIds),
        status: In([COMMISSION_STATUS.PENDING, COMMISSION_STATUS.IN_ESCROW, COMMISSION_STATUS.AVAILABLE]),
      },
      { status: COMMISSION_STATUS.CANCELLED },
    );
  }

  async getByOrderItemIds(itemIds: string[]): Promise<CommissionRecord[]> {
    if (itemIds.length === 0) return [];
    return this.commissionRepo.find({ where: { order_item_id: In(itemIds) } });
  }

  async getCreatorSummary(creatorId: string): Promise<CreatorCommissionSummary> {
    try {
      const records = await this.commissionRepo.find({
        where: { creator_id: creatorId },
        order: { created_at: 'DESC' },
      });

      const total_earned = records
        .filter((r) => r.status !== COMMISSION_STATUS.CANCELLED)
        .reduce((sum, r) => sum + Number(r.commission_amount), 0);

      const available_balance = records
        .filter((r) => r.status === COMMISSION_STATUS.AVAILABLE)
        .reduce((sum, r) => sum + Number(r.commission_amount), 0);

      const in_escrow = records
        .filter((r) => r.status === COMMISSION_STATUS.PENDING || r.status === COMMISSION_STATUS.IN_ESCROW)
        .reduce((sum, r) => sum + Number(r.commission_amount), 0);

      const total_paid = records
        .filter((r) => r.status === COMMISSION_STATUS.PAID)
        .reduce((sum, r) => sum + Number(r.commission_amount), 0);

      return { total_earned, available_balance, in_escrow, total_paid, records };
    } catch (error) {
      handleServiceError(error, 'Failed to get creator commission summary', CommissionsService.name);
    }
  }

  async getVendorSummary(vendorId: string): Promise<VendorCommissionSummary> {
    try {
      const records = await this.commissionRepo.find({
        where: { vendor_id: vendorId },
        order: { created_at: 'DESC' },
      });

      const activeRecords = records.filter((r) => r.status !== COMMISSION_STATUS.CANCELLED);

      const total_revenue = activeRecords.reduce((sum, r) => sum + Number(r.order_amount), 0);
      const total_commissions_paid = activeRecords.reduce((sum, r) => sum + Number(r.commission_amount), 0);
      const total_platform_fees = activeRecords.reduce((sum, r) => sum + Number(r.platform_fee), 0);
      const net_revenue = activeRecords.reduce((sum, r) => sum + Number(r.vendor_net), 0);

      return { total_revenue, total_commissions_paid, total_platform_fees, net_revenue, records };
    } catch (error) {
      handleServiceError(error, 'Failed to get vendor commission summary', CommissionsService.name);
    }
  }

  async getPlatformCommissionTotals(): Promise<{ total_commission: number; total_platform_fees: number }> {
    try {
      const records = await this.commissionRepo
        .createQueryBuilder('cr')
        .select(['cr.commission_amount', 'cr.platform_fee', 'cr.status'])
        .getMany();
      const active = records.filter((r) => r.status !== COMMISSION_STATUS.CANCELLED);
      return {
        total_commission: active.reduce((sum, r) => sum + Number(r.commission_amount), 0),
        total_platform_fees: active.reduce((sum, r) => sum + Number(r.platform_fee), 0),
      };
    } catch (error) {
      handleServiceError(error, 'Failed to get platform commission totals', CommissionsService.name);
    }
  }
}
