import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, DataSource } from 'typeorm';
import { Creneau } from '../common/entities/creneau.entity';
import { Reservation } from '../common/entities/reservation.entity';
import { Terrain } from '../common/entities/terrain.entity';
import { StatutCreneau, StatutReservation } from '../common/enums';

export interface CalendrierCellule {
  creneauId: number | null;
  debut: string;
  fin: string;
  statut: StatutCreneau | null;
  prix: number;
  clientNom?: string;
  codeConfirmation?: string;
}

function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
}

function toLocalDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function heureKey(d: Date): string {
  return toLocalDateKey(d) + 'T' + String(d.getHours()).padStart(2, '0');
}

@Injectable()
export class CalendrierService {
  private readonly HEURE_DEBUT = 0;
  private readonly HEURE_FIN = 24;

  constructor(
    @InjectRepository(Creneau)     private creneauRepo: Repository<Creneau>,
    @InjectRepository(Reservation) private resaRepo: Repository<Reservation>,
    @InjectRepository(Terrain)     private terrainRepo: Repository<Terrain>,
    private dataSource: DataSource,
  ) {}

  async getSemaine(terrainId: number, lundi: Date): Promise<Record<string, CalendrierCellule[]>> {
    const terrain = await this.terrainRepo.findOne({ where: { id: terrainId } });
    const prixDefaut = terrain ? Number(terrain.prixParHeure) : 40000;

    // Diagnostic complet
    const toutesResas: any[] = await this.dataSource.query('SELECT id, statut, creneau_id FROM reservations');
    console.log('[DIAG] Toutes reservations en base: ' + JSON.stringify(toutesResas));

    const tousCrenaux: any[] = await this.dataSource.query('SELECT id, terrain_id, statut, debut FROM creneaux');
    console.log('[DIAG] Tous creneaux en base: ' + JSON.stringify(tousCrenaux));

    const resasActives: Array<{
      id: number;
      statut: string;
      codeConfirmation: string;
      creneauId: number;
      creneauDebut: Date;
      prenom: string;
      nom: string;
    }> = await this.dataSource.query(
      `SELECT r.id,
              r.statut,
              r.code_confirmation AS codeConfirmation,
              c.id                AS creneauId,
              c.debut             AS creneauDebut,
              u.prenom,
              u.nom
       FROM reservations r
       INNER JOIN creneaux c     ON c.id = r.creneau_id
       INNER JOIN terrains t     ON t.id = c.terrain_id
       LEFT  JOIN utilisateurs u ON u.id = r.utilisateur_id
       WHERE t.id = ?
         AND r.statut IN ('EN_ATTENTE', 'CONFIRMEE')`,
      [terrainId],
    );

    console.log('[Calendrier] reservations actives pour terrain ' + terrainId + ': ' + resasActives.length);

    const resaParHeure = new Map<string, typeof resasActives[0]>();
    for (const r of resasActives) {
      const key = heureKey(new Date(r.creneauDebut));
      resaParHeure.set(key, r);
    }

    const finSemaine = new Date(lundi);
    finSemaine.setDate(finSemaine.getDate() + 7);
    const creneauxBloques: Array<{ debut: Date }> = await this.dataSource.query(
      `SELECT c.debut FROM creneaux c
       WHERE c.terrain_id = ? AND c.statut = 'BLOQUE'
         AND c.debut BETWEEN ? AND ?`,
      [terrainId, lundi, finSemaine],
    );
    const bloqueMap = new Map<string, boolean>();
    creneauxBloques.forEach(c => bloqueMap.set(heureKey(new Date(c.debut)), true));

    const grille: Record<string, CalendrierCellule[]> = {};
    const now = new Date();

    for (let j = 0; j < 7; j++) {
      const jour = new Date(lundi);
      jour.setDate(jour.getDate() + j);
      const jourKey = toLocalDateKey(jour);
      const cellules: CalendrierCellule[] = [];

      for (let h = this.HEURE_DEBUT; h < this.HEURE_FIN; h++) {
        const debut = new Date(jour);
        debut.setHours(h, 0, 0, 0);
        const fin = new Date(jour);
        if (h === 23) { fin.setDate(fin.getDate() + 1); fin.setHours(0, 0, 0, 0); }
        else { fin.setHours(h + 1, 0, 0, 0); }

        const key = heureKey(debut);

        if (debut < now) {
          // Heure passée — vérifier si une réservation CONFIRMEE existe sur ce créneau
          // Si oui, l'afficher pour garder l'historique visible sur le calendrier
          const resaPassee = resaParHeure.get(key);
          if (resaPassee && resaPassee.statut === 'CONFIRMEE') {
            cellules.push({
              creneauId: resaPassee.creneauId,
              debut: toLocalISO(debut),
              fin: toLocalISO(fin),
              statut: StatutCreneau.RESERVE,
              prix: prixDefaut,
              clientNom: (resaPassee.prenom + ' ' + resaPassee.nom).trim(),
              codeConfirmation: resaPassee.codeConfirmation,
            });
          } else {
            cellules.push({ creneauId: null, debut: toLocalISO(debut), fin: toLocalISO(fin), statut: null, prix: prixDefaut });
          }
        } else if (bloqueMap.has(key)) {
          cellules.push({ creneauId: null, debut: toLocalISO(debut), fin: toLocalISO(fin), statut: StatutCreneau.BLOQUE, prix: prixDefaut });
        } else {
          const resa = resaParHeure.get(key);
          cellules.push({
            creneauId: resa ? resa.creneauId : null,
            debut: toLocalISO(debut),
            fin: toLocalISO(fin),
            statut: resa ? StatutCreneau.RESERVE : StatutCreneau.DISPONIBLE,
            prix: prixDefaut,
            clientNom: resa ? (resa.prenom + ' ' + resa.nom).trim() : undefined,
            codeConfirmation: resa ? resa.codeConfirmation : undefined,
          });
        }
      }
      grille[jourKey] = cellules;
    }
    return grille;
  }

  async creerOuTrouverCreneau(terrainId: number, debut: Date): Promise<number> {
    const fin = new Date(debut);
    if (debut.getHours() === 23) { fin.setDate(fin.getDate() + 1); fin.setHours(0, 0, 0, 0); }
    else { fin.setHours(fin.getHours() + 1); }

    const debutExact = new Date(debut);
    debutExact.setSeconds(0, 0);

    const conflits: Array<{ id: number; statut: string }> = await this.dataSource.query(
      `SELECT c.id, c.statut FROM creneaux c
       WHERE c.terrain_id = ?
         AND DATE_FORMAT(c.debut, '%Y-%m-%d %H:00:00') = DATE_FORMAT(?, '%Y-%m-%d %H:00:00')
       LIMIT 1`,
      [terrainId, debutExact],
    );

    if (conflits.length > 0) {
      const c = conflits[0];
      if (c.statut === StatutCreneau.RESERVE) throw new Error('Ce creneau est deja reserve');
      if (c.statut === StatutCreneau.BLOQUE)  throw new Error('Ce creneau est bloque');
      return c.id;
    }

    const resaConflits: Array<{ id: number }> = await this.dataSource.query(
      `SELECT r.id FROM reservations r
       INNER JOIN creneaux c ON c.id = r.creneau_id
       WHERE c.terrain_id = ?
         AND DATE_FORMAT(c.debut, '%Y-%m-%d %H:00:00') = DATE_FORMAT(?, '%Y-%m-%d %H:00:00')
         AND r.statut IN ('EN_ATTENTE', 'CONFIRMEE')
       LIMIT 1`,
      [terrainId, debutExact],
    );
    if (resaConflits.length > 0) throw new Error('Ce creneau est deja reserve');

    // Insertion via SQL direct pour garantir que terrain_id est bien sauvegardé
    const debutStr = debutExact.getFullYear() + '-' +
      String(debutExact.getMonth() + 1).padStart(2, '0') + '-' +
      String(debutExact.getDate()).padStart(2, '0') + ' ' +
      String(debutExact.getHours()).padStart(2, '0') + ':00:00';
    const finStr = fin.getFullYear() + '-' +
      String(fin.getMonth() + 1).padStart(2, '0') + '-' +
      String(fin.getDate()).padStart(2, '0') + ' ' +
      String(fin.getHours()).padStart(2, '0') + ':00:00';

    const result = await this.dataSource.query(
      'INSERT INTO creneaux (terrain_id, debut, fin, statut, created_at) VALUES (?, ?, ?, ?, NOW())',
      [terrainId, debutStr, finStr, StatutCreneau.DISPONIBLE],
    );
    console.log('[creerOuTrouver] creneau cree id=' + result.insertId + ' terrain_id=' + terrainId);
    return result.insertId;
  }
}
