import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 *
 */
@Entity({ name: 'ticket_messages' })
export class TicketMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'ticket_id' })
  ticketId!: string;

  @Index('IDX_ticket_messages_sender_id')
  @Column({ type: 'integer', name: 'sender_id' })
  senderId!: number;

  @Column({ type: 'varchar', length: 8, name: 'sender_role' })
  senderRole!: string;

  @Column({ type: 'text' })
  text!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
