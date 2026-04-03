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
    const debutJour = new Date(now); debutJour.setHours(0, 0, 0, 0);
    const finJour   = new Date(now); finJour.setHours(23, 59, 59, 999);
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

    const creneauxDispoJour = await this.creneauRepo.count({
      where: { statut: StatutCreneau.DISPONIBLE, debut: Between(debutJour, finJour) },
    });

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
    const tauxOccupation = resaJour > 0 && creneauxDispoJour > 0
      ? Math.round((resaJour / (resaJour + creneauxDispoJour)) * 1000) / 10 : 0;

    return {
      totalReservationsAujourdhui: resaJour,
      totalReservationsMois: resaMois,
      revenuAujourdhui: revenuJour,
      revenuMois,
      creneauxDisponiblesAujourdhui: creneauxDispoJour,
      tauxOccupation,
      prochainesReservations,
    };
  }

  async toutesReservations() {
    return this.reservationsService.toutesReservations();
  }
}
