import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { COMMISSION_STATUS } from 'src/core/enums';

@Entity('commission_records')
export class CommissionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  order_item_id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  creator_id: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  affiliate_id: string | null;

  @Index()
  @Column({ type: 'uuid' })
  vendor_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  order_amount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  commission_percent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  commission_amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  platform_fee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  vendor_net: number;

  @Column({ type: 'enum', enum: COMMISSION_STATUS, default: COMMISSION_STATUS.IN_ESCROW })
  status: COMMISSION_STATUS;

  @Column({ type: 'timestamptz', nullable: true })
  available_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
