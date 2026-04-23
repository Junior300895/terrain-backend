import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum CategorieDepense {
  BALLON              = 'BALLON',
  DOSSARDS            = 'DOSSARDS',
  CURAGE_BASSIN       = 'CURAGE_BASSIN',
  ENTRETIEN_BASSIN    = 'ENTRETIEN_BASSIN',
  PRODUITS_ENTRETIEN  = 'PRODUITS_ENTRETIEN',
  ELECTRICITE         = 'ELECTRICITE',
  EAU                 = 'EAU',
  FEMME_MENAGE        = 'FEMME_MENAGE',
  GARDIENNAGE         = 'GARDIENNAGE',
  CHEF_EXPLOITATION   = 'CHEF_EXPLOITATION',
  GESTIONNAIRE_PELOUSE = 'GESTIONNAIRE_PELOUSE',
  ADJOINT_CHEF        = 'ADJOINT_CHEF',
  TRESORIER           = 'TRESORIER',
  SUPERVISEUR         = 'SUPERVISEUR',
  AUTRE               = 'AUTRE',
}

export enum StatutDepense {
  PAYEE     = 'PAYEE',
  EN_ATTENTE = 'EN_ATTENTE',
}

@Entity('depenses')
export class Depense {
  @PrimaryGeneratedColumn('increment') id: number;
  @Column({ type: 'enum', enum: CategorieDepense }) categorie: CategorieDepense;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) montant: number;
  @Column({ length: 255 }) description: string;
  @Column({ name: 'date_depense', type: 'date' }) dateDepense: string;
  @Column({ name: 'reference_facture', length: 100, nullable: true }) referenceFacture: string;
  @Column({ name: 'fichier_url', length: 500, nullable: true }) fichierUrl: string;
  @Column({ name: 'fichier_nom', length: 255, nullable: true }) fichierNom: string;
  @Column({ type: 'enum', enum: StatutDepense, default: StatutDepense.PAYEE }) statut: StatutDepense;
  @Column({ type: 'text', nullable: true }) notes: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
