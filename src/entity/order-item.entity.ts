import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import type { Relation } from 'typeorm';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  order_id: string;

  @Index()
  @Column({ type: 'uuid' })
  product_id: string;

  @Index()
  @Column()
  variant_id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  affiliate_id: string | null;

  @Index()
  @Column({ type: 'uuid' })
  vendor_id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  creator_id: string | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unit_price: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_price: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<Order>;
}
