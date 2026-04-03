import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Reservation } from '../common/entities/reservation.entity';
import { Creneau } from '../common/entities/creneau.entity';
import { Utilisateur } from '../common/entities/utilisateur.entity';
import { Paiement } from '../common/entities/paiement.entity';
import { StatutReservation, StatutCreneau, StatutPaiement } from '../common/enums';
import { CreerReservationDto } from './reservations.dto';
import { ReservationResponseDto } from './reservation-response.dto';
import { v4 as uuid } from 'uuid';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation) private resaRepo: Repository<Reservation>,
    @InjectRepository(Creneau)      private creneauRepo: Repository<Creneau>,
    @InjectRepository(Paiement)     private paiementRepo: Repository<Paiement>,
    private config: ConfigService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async creer(dto: CreerReservationDto, utilisateur: Utilisateur): Promise<ReservationResponseDto> {
    const creneau = await this.creneauRepo.findOne({
      where: { id: dto.creneauId }, relations: ['terrain'],
    });
    if (!creneau) throw new NotFoundException('Créneau introuvable');
    if (new Date(creneau.debut) < new Date()) throw new BadRequestException('Ce créneau est déjà passé');

    const activeExiste = await this.resaRepo.findOne({
      where: { creneau: { id: dto.creneauId }, statut: In([StatutReservation.EN_ATTENTE, StatutReservation.CONFIRMEE]) },
    });
    if (activeExiste) throw new BadRequestException('Ce créneau est déjà réservé');
    if (creneau.statut === StatutCreneau.BLOQUE) throw new BadRequestException('Ce créneau est bloqué');

    // UPDATE direct pour ne pas écraser terrain_id avec null
    await this.creneauRepo.update(creneau.id, { statut: StatutCreneau.RESERVE });

    const montantTotal = creneau.prixEffectif * creneau.dureeHeures;
    const reservation = this.resaRepo.create({
      utilisateur, creneau,
      statut: StatutReservation.EN_ATTENTE,
      montantTotal,
      codeConfirmation: `FOOT-${uuid().substring(0, 8).toUpperCase()}`,
      notes: dto.notes,
    });
    const saved = await this.resaRepo.save(reservation);
    return this.findDtoById(saved.id);
  }

  async mesReservations(utilisateurId: number): Promise<ReservationResponseDto[]> {
    const resas = await this.resaRepo.find({
      where: { utilisateur: { id: utilisateurId } },
      relations: ['utilisateur', 'creneau', 'creneau.terrain'],
      order: { createdAt: 'DESC' },
    });
    return this.attachPaiementsDto(resas);
  }

  async trouverParCode(code: string): Promise<ReservationResponseDto> {
    const resa = await this.resaRepo.findOne({
      where: { codeConfirmation: code },
      relations: ['utilisateur', 'creneau', 'creneau.terrain'],
    });
    if (!resa) throw new NotFoundException(`Réservation introuvable: ${code}`);
    const paiement = await this.paiementRepo.findOne({ where: { reservationId: resa.id } });
    return ReservationResponseDto.fromEntity(resa, paiement);
  }

  async annuler(id: number, utilisateur: Utilisateur): Promise<ReservationResponseDto> {
    const resa = await this.findById(id);
    if (resa.utilisateur.id !== utilisateur.id)
      throw new ForbiddenException('Vous ne pouvez annuler que vos propres réservations');
    if (resa.statut === StatutReservation.CONFIRMEE)
      throw new BadRequestException('Une réservation confirmée ne peut pas être annulée. Contactez-nous.');
    if (resa.statut === StatutReservation.ANNULEE) throw new BadRequestException('Déjà annulée');
    if (resa.statut === StatutReservation.EXPIREE) throw new BadRequestException('Réservation expirée');

    const minutesAvant = (new Date(resa.creneau.debut).getTime() - Date.now()) / 60000;
    const delai = Number(this.config.get('DELAI_ANNULATION_HEURES', 2)) * 60;
    if (minutesAvant < delai)
      throw new BadRequestException(`Annulation impossible à moins de ${delai / 60}h du créneau`);

    resa.statut = StatutReservation.ANNULEE;
    await this.creneauRepo.update(resa.creneau.id, { statut: StatutCreneau.DISPONIBLE });
    const saved = await this.resaRepo.save(resa);
    const paiement = await this.paiementRepo.findOne({ where: { reservationId: saved.id } });
    return ReservationResponseDto.fromEntity(saved, paiement);
  }

  async annulerParAdmin(id: number): Promise<ReservationResponseDto> {
    const resa = await this.findById(id);
    if (resa.statut === StatutReservation.ANNULEE) throw new BadRequestException('Déjà annulée');

    resa.statut = StatutReservation.ANNULEE;
    await this.creneauRepo.update(resa.creneau.id, { statut: StatutCreneau.DISPONIBLE });
    const saved = await this.resaRepo.save(resa);

    // Si la réservation était confirmée (paiement validé) → passer le paiement à REMBOURSE
    let paiement = await this.paiementRepo.findOne({ where: { reservationId: saved.id } });
    if (paiement && paiement.statut === StatutPaiement.VALIDE) {
      await this.paiementRepo.update(paiement.id, { statut: StatutPaiement.REMBOURSE });
      paiement = await this.paiementRepo.findOne({ where: { id: paiement.id } });
    }

    return ReservationResponseDto.fromEntity(saved, paiement);
  }

  async toutesReservations(): Promise<ReservationResponseDto[]> {
    const resas = await this.resaRepo.find({
      relations: ['utilisateur', 'creneau', 'creneau.terrain'],
      order: { createdAt: 'DESC' },
    });
    return this.attachPaiementsDto(resas);
  }

  // Réservation par l'admin pour un client (existant ou nouveau)
  async reserverPourClient(dto: {
    terrainId: number;
    debut: string;       // ISO local ex: 2026-03-30T10:00:00
    telephone: string;
    nom?: string;
    prenom?: string;
    notes?: string;
  }): Promise<ReservationResponseDto> {
    // 1. Trouver ou créer le client
    let client = await this.dataSource.query(
      'SELECT id, nom, prenom, telephone, role FROM utilisateurs WHERE telephone = ? LIMIT 1',
      [dto.telephone],
    ).then((rows: any[]) => rows[0] ?? null);

    if (!client) {
      if (!dto.nom || !dto.prenom)
        throw new BadRequestException('Client inconnu — nom et prénom requis pour créer le compte');

      const bcrypt = await import('bcrypt');
      const motDePasse = await bcrypt.hash('Terrain@1234', 12);

      const result = await this.dataSource.query(
        `INSERT INTO utilisateurs (nom, prenom, telephone, mot_de_passe, role, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'CLIENT', 1, NOW(), NOW())`,
        [dto.nom, dto.prenom, dto.telephone, motDePasse],
      );
      client = { id: result.insertId, nom: dto.nom, prenom: dto.prenom, telephone: dto.telephone };
    }

    // 2. Trouver ou créer le créneau via SQL direct
    const [datePart, timePart] = dto.debut.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const heure = parseInt((timePart ?? '00').split(':')[0], 10);
    const pad = (n: number) => String(n).padStart(2, '0');
    const debutStr = y + '-' + pad(m) + '-' + pad(d) + ' ' + pad(heure) + ':00:00';
    const finH = heure === 23 ? 0 : heure + 1;
    const finDate = heure === 23 ? new Date(y, m - 1, d + 1) : new Date(y, m - 1, d);
    const finStr = finDate.getFullYear() + '-' + pad(finDate.getMonth()+1) + '-' + pad(finDate.getDate()) +
                   ' ' + pad(finH) + ':00:00';

    // Vérifier conflit
    const conflit: any[] = await this.dataSource.query(
      `SELECT r.id FROM reservations r
       INNER JOIN creneaux c ON c.id = r.creneau_id
       WHERE c.terrain_id = ? AND DATE_FORMAT(c.debut,'%Y-%m-%d %H') = DATE_FORMAT(?,'%Y-%m-%d %H')
         AND r.statut IN ('EN_ATTENTE','CONFIRMEE') LIMIT 1`,
      [dto.terrainId, debutStr],
    );
    if (conflit.length > 0) throw new BadRequestException('Ce créneau est déjà réservé');

    // Terrain pour le prix
    const terrain: any = await this.dataSource.query(
      'SELECT id, prix_par_heure FROM terrains WHERE id = ? LIMIT 1',
      [dto.terrainId],
    ).then((rows: any[]) => rows[0]);
    if (!terrain) throw new NotFoundException('Terrain introuvable');

    // Créer ou trouver le créneau
    let creneauId: number;
    const existant: any[] = await this.dataSource.query(
      `SELECT id FROM creneaux WHERE terrain_id = ? AND DATE_FORMAT(debut,'%Y-%m-%d %H') = DATE_FORMAT(?,'%Y-%m-%d %H') LIMIT 1`,
      [dto.terrainId, debutStr],
    );
    if (existant.length > 0) {
      creneauId = existant[0].id;
    } else {
      const ins = await this.dataSource.query(
        'INSERT INTO creneaux (terrain_id, debut, fin, statut, created_at) VALUES (?, ?, ?, ?, NOW())',
        [dto.terrainId, debutStr, finStr, 'DISPONIBLE'],
      );
      creneauId = ins.insertId;
    }

    // Passer le créneau à RESERVE
    await this.dataSource.query('UPDATE creneaux SET statut = ? WHERE id = ?', ['RESERVE', creneauId]);

    // 3. Créer la réservation
    const montantTotal = Number(terrain.prix_par_heure);
    const code = 'FOOT-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const resaResult = await this.dataSource.query(
      `INSERT INTO reservations (utilisateur_id, creneau_id, statut, montant_total, code_confirmation, notes, created_at, updated_at)
       VALUES (?, ?, 'EN_ATTENTE', ?, ?, ?, NOW(), NOW())`,
      [client.id, creneauId, montantTotal, code, dto.notes ?? null],
    );

    return this.findDtoById(resaResult.insertId);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findById(id: number): Promise<Reservation> {
    const resa = await this.resaRepo.findOne({
      where: { id },
      relations: ['utilisateur', 'creneau', 'creneau.terrain'],
    });
    if (!resa) throw new NotFoundException(`Réservation ${id} introuvable`);
    return resa;
  }

  async findDtoById(id: number): Promise<ReservationResponseDto> {
    const resa = await this.findById(id);
    const paiement = await this.paiementRepo.findOne({ where: { reservationId: id } });
    return ReservationResponseDto.fromEntity(resa, paiement);
  }

  private async attachPaiementsDto(resas: Reservation[]): Promise<ReservationResponseDto[]> {
    if (!resas.length) return [];
    const ids = resas.map(r => r.id);
    const paiements = await this.paiementRepo.find({ where: { reservationId: In(ids) } });
    const map = new Map(paiements.map(p => [p.reservationId, p]));
    return resas.map(r => ReservationResponseDto.fromEntity(r, map.get(r.id)));
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expirerReservationsNonPayees() {
    const delai = Number(this.config.get('DELAI_EXPIRATION_MINUTES', 30));
    const limite = new Date(Date.now() - delai * 60 * 1000);
    const aExpirer = await this.resaRepo.find({
      where: { statut: StatutReservation.EN_ATTENTE },
      relations: ['creneau'],
    });
    const filtrees = aExpirer.filter(r => new Date(r.createdAt) < limite);
    for (const r of filtrees) {
      r.statut = StatutReservation.EXPIREE;
      await this.creneauRepo.update(r.creneau.id, { statut: StatutCreneau.DISPONIBLE });
      await this.resaRepo.save(r);
    }
  }
}
