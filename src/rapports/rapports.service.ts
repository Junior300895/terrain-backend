import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export interface RapportParams {
  debut: string; // YYYY-MM-DD
  fin:   string; // YYYY-MM-DD
}

export interface RapportData {
  periode: { debut: string; fin: string };
  reservations: ReservationRapport[];
  revenus: RevenusRapport;
  occupation: OccupationRapport;
  clients: ClientRapport[];
}

export interface ReservationRapport {
  id: number;
  code: string;
  date: string;
  heure: string;
  client: string;
  telephone: string;
  statut: string;
  montant: number;
  modePaiement: string;
}

export interface RevenusRapport {
  total: number;
  confirme: number;
  enAttente: number;
  annule: number;
  rembourse: number;
  parJour: { date: string; montant: number }[];
}

export interface OccupationRapport {
  totalCreneaux: number;
  reserves: number;
  confirmes: number;
  annules: number;
  tauxOccupation: number;
  parJour: { date: string; reserves: number; disponibles: number; taux: number }[];
}

export interface ClientRapport {
  id: number;
  nom: string;
  prenom: string;
  telephone: string;
  nbReservations: number;
  nbConfirmees: number;
  montantTotal: number;    // Montant réellement encaissé
  derniereVisite: string;
}

@Injectable()
export class RapportsService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async generer(params: RapportParams): Promise<RapportData> {
    const { debut, fin } = params;
    const finInclus = fin + ' 23:59:59';

    const [reservations, revenus, occupation, clients] = await Promise.all([
      this.getReservations(debut, finInclus),
      this.getRevenus(debut, finInclus),
      this.getOccupation(debut, finInclus),
      this.getClients(debut, finInclus),
    ]);

    return { periode: { debut, fin }, reservations, revenus, occupation, clients };
  }

  private async getReservations(debut: string, fin: string): Promise<ReservationRapport[]> {
    const rows: any[] = await this.dataSource.query(`
      SELECT
        r.id,
        r.code_confirmation         AS code,
        DATE_FORMAT(c.debut, '%Y-%m-%d') AS date,
        DATE_FORMAT(c.debut, '%H:%i')    AS heure,
        CONCAT(u.prenom, ' ', u.nom)     AS client,
        u.telephone,
        r.statut,
        r.montant_total                                    AS montantDu,
        COALESCE(SUM(CASE WHEN p.statut='VALIDE' THEN p.montant ELSE 0 END), 0) AS montantEncaisse,
        MAX(p.mode)                                        AS modePaiement
      FROM reservations r
      INNER JOIN creneaux      c ON c.id = r.creneau_id
      INNER JOIN utilisateurs  u ON u.id = r.utilisateur_id
      LEFT  JOIN paiements     p ON p.reservation_id = r.id
      WHERE c.debut BETWEEN ? AND ?
        AND (
          r.statut IN ('CONFIRMEE', 'EN_ATTENTE')
          OR (r.statut IN ('ANNULEE') AND EXISTS (
            SELECT 1 FROM paiements p WHERE p.reservation_id = r.id AND p.statut = 'VALIDE'
          ))
        )
      GROUP BY r.id, r.code_confirmation, c.debut, u.prenom, u.nom, u.telephone, r.statut, r.montant_total
      ORDER BY c.debut ASC
    `, [debut, fin]);
    return rows.map(r => ({
      id: r.id, code: r.code, date: r.date, heure: r.heure,
      client: r.client, telephone: r.telephone, statut: r.statut,
      montant: Number(r.montantEncaisse),
      montantDu: Number(r.montantDu),
      modePaiement: r.modePaiement ?? '—',
    }));
  }

  private async getRevenus(debut: string, fin: string): Promise<RevenusRapport> {
    // Source de vérité : la date du PAIEMENT (paid_at), pas la date du créneau
    // Un acompte versé le 31/03 pour un match du 01/04 est encaissé le 31/03
    const totaux: any[] = await this.dataSource.query(`
      SELECT
        r.statut,
        p.statut AS statutPaiement,
        COALESCE(SUM(p.montant), 0) AS total
      FROM paiements p
      INNER JOIN reservations r ON r.id = p.reservation_id
      WHERE p.paid_at BETWEEN ? AND ?
      GROUP BY r.statut, p.statut
    `, [debut, fin]);

    const parJour: any[] = await this.dataSource.query(`
      SELECT
        DATE_FORMAT(p.paid_at, '%Y-%m-%d') AS date,
        COALESCE(SUM(p.montant), 0)        AS montant
      FROM paiements p
      WHERE p.paid_at BETWEEN ? AND ?
        AND p.statut = 'VALIDE'
      GROUP BY DATE_FORMAT(p.paid_at, '%Y-%m-%d')
      ORDER BY date ASC
    `, [debut, fin]);

    let confirme = 0, enAttente = 0, annule = 0, rembourse = 0;
    for (const row of totaux) {
      const m = Number(row.total);
      if (row.statutPaiement === 'VALIDE')     confirme  += m;
      if (row.statutPaiement === 'EN_ATTENTE') enAttente += m;
      if (row.statutPaiement === 'REMBOURSE')  rembourse += m;
    }

    return {
      total: confirme + enAttente,
      confirme, enAttente, annule, rembourse,
      parJour: parJour.map(r => ({ date: r.date, montant: Number(r.montant) })),
    };
  }

  private async getOccupation(debut: string, fin: string): Promise<OccupationRapport> {
    const stats: any[] = await this.dataSource.query(`
      SELECT
        DATE_FORMAT(c.debut, '%Y-%m-%d') AS date,
        COUNT(*)                          AS totalCreneaux,
        SUM(CASE WHEN r.statut IN ('EN_ATTENTE','CONFIRMEE') THEN 1 ELSE 0 END) AS reserves,
        SUM(CASE WHEN r.statut = 'CONFIRMEE'                 THEN 1 ELSE 0 END) AS confirmes,
        SUM(CASE WHEN r.statut IN ('ANNULEE','EXPIREE')      THEN 1 ELSE 0 END) AS annules
      FROM creneaux c
      LEFT JOIN reservations r ON r.creneau_id = c.id
      WHERE c.debut BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(c.debut, '%Y-%m-%d')
      ORDER BY date ASC
    `, [debut, fin]);

    // Calculer les créneaux virtuels (24h/jour)
    const nbJours = Math.max(1, Math.round(
      (new Date(fin).getTime() - new Date(debut).getTime()) / 86400000
    ));
    const totalVirtuel = nbJours * 24;
    const totalReserves  = stats.reduce((s, r) => s + Number(r.reserves),  0);
    const totalConfirmes = stats.reduce((s, r) => s + Number(r.confirmes), 0);
    const totalAnnules   = stats.reduce((s, r) => s + Number(r.annules),   0);

    return {
      totalCreneaux:  totalVirtuel,
      reserves:       totalReserves,
      confirmes:      totalConfirmes,
      annules:        totalAnnules,
      tauxOccupation: Math.round((totalReserves / totalVirtuel) * 1000) / 10,
      parJour: stats.map(r => ({
        date:        r.date,
        reserves:    Number(r.reserves),
        disponibles: 24 - Number(r.reserves),
        taux:        Math.round((Number(r.reserves) / 24) * 1000) / 10,
      })),
    };
  }

  private async getClients(debut: string, fin: string): Promise<ClientRapport[]> {
    const rows: any[] = await this.dataSource.query(`
      SELECT
        u.id,
        u.nom, u.prenom, u.telephone,
        COUNT(r.id)                       AS nbReservations,
        SUM(CASE WHEN r.statut = 'CONFIRMEE' THEN 1 ELSE 0 END) AS nbConfirmees,
        COALESCE(SUM(CASE WHEN p.statut = 'VALIDE' THEN p.montant ELSE 0 END), 0) AS montantTotal,
        MAX(c.debut)                      AS derniereVisite
      FROM reservations r
      INNER JOIN creneaux     c ON c.id = r.creneau_id
      INNER JOIN utilisateurs u ON u.id = r.utilisateur_id
      LEFT  JOIN paiements     p ON p.reservation_id = r.id
      WHERE c.debut BETWEEN ? AND ?
      GROUP BY u.id, u.nom, u.prenom, u.telephone
      ORDER BY nbConfirmees DESC, montantTotal DESC
    `, [debut, fin]);

    return rows.map(r => ({
      id: r.id, nom: r.nom, prenom: r.prenom, telephone: r.telephone,
      nbReservations: Number(r.nbReservations),
      nbConfirmees:   Number(r.nbConfirmees),
      montantTotal:   Number(r.montantTotal),
      derniereVisite: r.derniereVisite
        ? new Date(r.derniereVisite).toLocaleDateString('fr-FR') : '—',
    }));
  }

  // Export CSV
  genererCSV(data: RapportData): string {
    const lines: string[] = [];
    const sep = ';';

    lines.push('RAPPORT TERRAIN DAKAR');
    lines.push('Période: ' + data.periode.debut + ' au ' + data.periode.fin);
    lines.push('');

    // Réservations
    lines.push('=== RÉSERVATIONS ===');
    lines.push(['ID','Code','Date','Heure','Client','Téléphone','Statut','Montant (FCFA)','Mode paiement'].join(sep));
    data.reservations.forEach(r => {
      lines.push([r.id, r.code, r.date, r.heure, r.client, r.telephone,
                  r.statut, r.montant, r.modePaiement].join(sep));
    });
    lines.push('');

    // Revenus
    lines.push('=== REVENUS ===');
    lines.push(['Catégorie','Montant (FCFA)'].join(sep));
    lines.push(['Total confirmé',  data.revenus.confirme].join(sep));
    lines.push(['En attente',      data.revenus.enAttente].join(sep));
    lines.push(['Annulé',          data.revenus.annule].join(sep));
    lines.push(['Remboursé',       data.revenus.rembourse].join(sep));
    lines.push('');

    // Occupation par jour
    lines.push('=== OCCUPATION PAR JOUR ===');
    lines.push(['Date','Réservés','Disponibles','Taux (%)'].join(sep));
    data.occupation.parJour.forEach(j => {
      lines.push([j.date, j.reserves, j.disponibles, j.taux].join(sep));
    });
    lines.push('');

    // Clients
    lines.push('=== CLIENTS ===');
    lines.push(['Nom','Prénom','Téléphone','Nb réservations','Nb confirmées','Montant total (FCFA)','Dernière visite'].join(sep));
    data.clients.forEach(c => {
      lines.push([c.nom, c.prenom, c.telephone, c.nbReservations,
                  c.nbConfirmees, c.montantTotal, c.derniereVisite].join(sep));
    });

    return lines.join('\n');
  }
}
