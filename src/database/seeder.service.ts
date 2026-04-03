import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(private dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private async seed() {
    try {
      // Supprimer la contrainte UNIQUE sur reservation_id dans paiements (multi-paiements)
      try {
        await this.dataSource.query(
          'ALTER TABLE paiements DROP INDEX reservation_id'
        );
        this.logger.log('Contrainte UNIQUE reservation_id (paiements) supprimée');
      } catch (_) {}

      // Ajouter colonne type_paiement si absente
      try {
        await this.dataSource.query(
          "ALTER TABLE paiements ADD COLUMN type_paiement VARCHAR(20) NOT NULL DEFAULT 'TOTAL'"
        );
        this.logger.log('Colonne type_paiement ajoutée');
      } catch (_) {}

      // Supprimer la contrainte UNIQUE sur creneau_id si elle existe (legacy OneToOne)
      try {
        await this.dataSource.query(
          'ALTER TABLE reservations DROP INDEX REL_639b4e038a995622376cdf0a70'
        );
        this.logger.log('Contrainte UNIQUE creneau_id supprimée');
      } catch (_) {
        // Contrainte absente ou déjà supprimée — ignorer
      }

      // Terrain principal
      await this.dataSource.query(`
        INSERT IGNORE INTO terrains (nom, description, capacite, prix_par_heure, adresse, actif)
        VALUES ('Terrain Principal', 'Terrain de football en gazon synthetique, eclairage LED', 22, 40000.00, 'Dakar, Senegal', 1)
      `);

      // Admin par defaut — mot de passe: Admin@1234
      await this.dataSource.query(`
        INSERT IGNORE INTO utilisateurs (nom, prenom, telephone, email, mot_de_passe, role, actif)
        VALUES ('Admin', 'Systeme', '770000000', 'admin@football.sn',
                '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HFbDrme', 'ADMIN', 1)
      `);

      this.logger.log('Seed OK — terrain et admin charges');
    } catch (err) {
      this.logger.error('Seed erreur: ' + err.message);
    }
  }
}
