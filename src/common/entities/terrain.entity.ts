import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';

@Entity('terrains')
export class Terrain {
  @PrimaryGeneratedColumn('increment') id: number;
  @Column({ length: 150 }) nom: string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ default: 22 }) capacite: number;
  @Column({ name: 'prix_par_heure', type: 'decimal', precision: 10, scale: 2 }) prixParHeure: number;
  @Column({ length: 255, nullable: true }) adresse: string;
  @Column({ default: true }) actif: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
