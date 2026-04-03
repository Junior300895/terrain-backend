import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { ModePaiement, StatutPaiement } from '../enums';

@Entity('paiements')
export class Paiement {
  @PrimaryGeneratedColumn('increment') id: number;
  @Column({ name: 'reservation_id' }) reservationId: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) montant: number;
  @Column({ name: 'type_paiement', length: 20, default: 'TOTAL' }) typePaiement: string;
  // TOTAL = paiement complet, ACOMPTE = acompte partiel, SOLDE = solde d'un acompte
  @Column({ type: 'enum', enum: ModePaiement }) mode: ModePaiement;
  @Column({ type: 'enum', enum: StatutPaiement, default: StatutPaiement.EN_ATTENTE }) statut: StatutPaiement;
  @Column({ name: 'reference_externe', length: 100, nullable: true }) referenceExterne: string;
  @Column({ length: 255, nullable: true }) notes: string;
  @Column({ name: 'paid_at', nullable: true }) paidAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
