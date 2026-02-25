import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { Delivery } from './delivery.entity';
import { Customer } from './customer.entity';
import { ORDER_STATUS } from 'src/core/enums';
import type { Relation } from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  customer_id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  creator_id: string | null;

  @Column({ length: 50 })
  payment_method: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_amount: number;

  @Index()
  @Column({
    type: 'enum',
    enum: ORDER_STATUS,
    default: ORDER_STATUS.PENDING,
  })
  status: ORDER_STATUS;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Customer, (customer) => customer.orders)
  @JoinColumn({ name: 'customer_id' })
  customer: Relation<Customer>;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: Relation<OrderItem>[];

  @OneToOne(() => Delivery, (delivery) => delivery.order, { cascade: true })
  delivery: Relation<Delivery>;
}
