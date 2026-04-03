import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { StatutCreneau } from '../enums';
import { Terrain } from './terrain.entity';

@Entity('creneaux')
export class Creneau {
  @PrimaryGeneratedColumn('increment') id: number;
  @ManyToOne(() => Terrain, { eager: false }) @JoinColumn({ name: 'terrain_id' }) terrain: Terrain;
  @Column({ type: 'datetime' }) debut: Date;
  @Column({ type: 'datetime' }) fin: Date;
  @Column({ type: 'enum', enum: StatutCreneau, default: StatutCreneau.DISPONIBLE }) statut: StatutCreneau;
  @Column({ name: 'prix_special', type: 'decimal', precision: 10, scale: 2, nullable: true }) prixSpecial: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  get prixEffectif(): number { return this.prixSpecial ? Number(this.prixSpecial) : Number(this.terrain?.prixParHeure ?? 40000); }
  get dureeHeures(): number { return Math.round((this.fin.getTime() - this.debut.getTime()) / 3600000); }
}
