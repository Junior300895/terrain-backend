import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Role } from '../enums';

@Entity('utilisateurs')
export class Utilisateur {
  @PrimaryGeneratedColumn('increment') id: number;
  @Column({ length: 100 }) nom: string;
  @Column({ length: 100 }) prenom: string;
  @Column({ length: 20, unique: true }) telephone: string;
  @Column({ length: 150, nullable: true, unique: true }) email: string;
  @Column({ name: 'mot_de_passe' }) @Exclude() motDePasse: string;
  @Column({ type: 'enum', enum: Role, default: Role.CLIENT }) role: Role;
  @Column({ default: true }) actif: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  get nomComplet(): string { return `${this.prenom} ${this.nom}`; }
}
