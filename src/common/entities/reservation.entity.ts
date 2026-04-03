import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { StatutReservation } from '../enums';
import { Utilisateur } from './utilisateur.entity';
import { Creneau } from './creneau.entity';
import { Paiement } from './paiement.entity';

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('increment') id: number;
  @ManyToOne(() => Utilisateur, { eager: false }) @JoinColumn({ name: 'utilisateur_id' }) utilisateur: Utilisateur;
  @ManyToOne(() => Creneau, { eager: false }) @JoinColumn({ name: 'creneau_id' }) creneau: Creneau;
  @Column({ type: 'enum', enum: StatutReservation, default: StatutReservation.EN_ATTENTE }) statut: StatutReservation;
  @Column({ name: 'montant_total', type: 'decimal', precision: 10, scale: 2 }) montantTotal: number;
  @Column({ name: 'code_confirmation', length: 20, unique: true }) codeConfirmation: string;
  @Column({ type: 'text', nullable: true }) notes: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  paiement?: Paiement;
}
