import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Between, In, DataSource } from 'typeorm';
import { Reservation } from '../common/entities/reservation.entity';
import { Paiement } from '../common/entities/paiement.entity';
import { Creneau } from '../common/entities/creneau.entity';
import { StatutReservation, StatutPaiement, StatutCreneau } from '../common/enums';
import { ReservationsService } from '../reservations/reservations.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Reservation) private resaRepo: Repository<Reservation>,
    @InjectRepository(Paiement)    private paiementRepo: Repository<Paiement>,
    @InjectRepository(Creneau)     private creneauRepo: Repository<Creneau>,
    private reservationsService: ReservationsService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async getDashboard() {
    const now = new Date();
    // Journée terrain : 6h00 → 2h59 du lendemain
    // Ex: jeudi → de jeudi 06:00 à vendredi 02:59
    const debutJour = new Date(now); debutJour.setHours(6, 0, 0, 0);
    const finJour   = new Date(now); finJour.setDate(finJour.getDate() + 1); finJour.setHours(2, 59, 59, 999);
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
    const finMois   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [resaJour, resaMois] = await Promise.all([
      this.resaRepo.count({ where: { statut: StatutReservation.CONFIRMEE, createdAt: Between(debutJour, finJour) } }),
      this.resaRepo.count({ where: { statut: StatutReservation.CONFIRMEE, createdAt: Between(debutMois, finMois) } }),
    ]);

    // Revenus via SQL direct avec plages de dates calculées côté Node.js
    // (évite tout problème de timezone entre Node et MySQL)
    const pad = (n: number) => String(n).padStart(2, '0');
    const toSQL = (d: Date) =>
      d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

    const [sqlJour, sqlMois]: any[][] = await Promise.all([
      this.dataSource.query(
        `SELECT COALESCE(SUM(p.montant), 0) AS total
         FROM paiements p
         WHERE p.statut = 'VALIDE'
           AND p.paid_at BETWEEN ? AND ?`,
        [toSQL(debutJour), toSQL(finJour)],
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM(p.montant), 0) AS total
         FROM paiements p
         WHERE p.statut = 'VALIDE'
           AND p.paid_at BETWEEN ? AND ?`,
        [toSQL(debutMois), toSQL(finMois)],
      ),
    ]);
    const paiementsJour: any[] = [];
    const paiementsMois: any[] = [];

    // 24 créneaux virtuels par jour — les créneaux libres n'existent pas en base
    const CRENEAUX_PAR_JOUR = 24;
    const creneauxDispoJour = Math.max(0, CRENEAUX_PAR_JOUR - resaJour);

    const resasJourRaw = await this.resaRepo.find({
      where: { creneau: { debut: Between(debutJour, finJour) } },
      relations: ['utilisateur', 'creneau', 'creneau.terrain'],
      order: { creneau: { debut: 'ASC' } },
      take: 10,
    });

    const ids = resasJourRaw.map(r => r.id);
    const paiementsJourMap = ids.length
      ? await this.paiementRepo.find({ where: { reservationId: In(ids) } })
      : [];
    const pMap = new Map(paiementsJourMap.map(p => [p.reservationId, p]));

    const { ReservationResponseDto } = await import('../reservations/reservation-response.dto');
    const prochainesReservations = resasJourRaw.map(r =>
      ReservationResponseDto.fromEntity(r, pMap.get(r.id))
    );

    const revenuJour = Number(sqlJour[0]?.total ?? 0);
    const revenuMois = Number(sqlMois[0]?.total ?? 0);
    const tauxOccupation = Math.round((resaJour / CRENEAUX_PAR_JOUR) * 1000) / 10;

    // Données des 7 derniers jours pour le graphique
    const sept7 = new Date(now); sept7.setDate(sept7.getDate() - 6); sept7.setHours(0,0,0,0);
    const parJour: any[] = await this.dataSource.query(
      `SELECT
         DATE_FORMAT(p.paid_at, '%Y-%m-%d') AS jour,
         COALESCE(SUM(p.montant), 0)        AS revenu,
         COUNT(DISTINCT p.reservation_id)   AS nbResa
       FROM paiements p
       WHERE p.statut = 'VALIDE'
         AND p.paid_at BETWEEN ? AND ?
       GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m-%d')
       ORDER BY jour ASC`,
      [toSQL(sept7), toSQL(finJour)],
    );

    // Remplir les jours sans données
    const semaine: { jour: string; label: string; revenu: number; nbResa: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
      const data = parJour.find((r: any) => r.jour === key);
      semaine.push({
        jour: key,
        label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
        revenu: data ? Number(data.revenu) : 0,
        nbResa: data ? Number(data.nbResa) : 0,
      });
    }

    return {
      totalReservationsAujourdhui: resaJour,
      totalReservationsMois: resaMois,
      revenuAujourdhui: revenuJour,
      revenuMois,
      creneauxDisponiblesAujourdhui: creneauxDispoJour,
      tauxOccupation,
      prochainesReservations,
      semaine,
    };
  }

  async toutesReservations() {
    return this.reservationsService.toutesReservations();
  }
}
