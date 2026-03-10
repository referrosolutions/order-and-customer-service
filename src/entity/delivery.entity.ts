import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { DELIVERY_STATUS } from 'src/core/enums';
import type { Relation } from 'typeorm';

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  order_id: string;

  @Column({ type: 'varchar', nullable: true })
  tracking_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  tracking_url: string | null;

  @Column({ type: 'varchar', nullable: true })
  delivery_method: string | null;

  @Column({ type: 'enum', enum: DELIVERY_STATUS, default: DELIVERY_STATUS.PENDING })
  status: DELIVERY_STATUS;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  delivery_charge: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;
}
