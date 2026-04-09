import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as PDFDocument from 'pdfkit';

@Injectable()
export class PdfService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  async getApercuJournalier(date: string): Promise<any> {
    const debut = date + ' 00:00:00';
    const fin   = date + ' 23:59:59';
    const dateObj = new Date(date + 'T00:00:00');
    const labelDate = dateObj.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    const rows: any[] = await this.ds.query(`
      SELECT
        r.id,
        r.code_confirmation             AS code,
        DATE_FORMAT(c.debut, '%H:%i')   AS heure,
        DATE_FORMAT(c.fin,   '%H:%i')   AS heureFin,
        CONCAT(u.prenom, ' ', u.nom)    AS client,
        u.telephone,
        r.statut,
        r.montant_total                 AS montantTotal,
        COALESCE(SUM(CASE WHEN p.statut='VALIDE' THEN p.montant ELSE 0 END), 0) AS encaisse
      FROM reservations r
      INNER JOIN creneaux     c ON c.id = r.creneau_id
      INNER JOIN utilisateurs u ON u.id = r.utilisateur_id
      LEFT  JOIN paiements    p ON p.reservation_id = r.id
      WHERE c.debut BETWEEN ? AND ?
        AND r.statut IN ('CONFIRMEE', 'EN_ATTENTE')
      GROUP BY r.id, r.code_confirmation, c.debut, c.fin,
               u.prenom, u.nom, u.telephone, r.statut, r.montant_total
      ORDER BY c.debut ASC
    `, [debut, fin]);

    const reservations = rows.map(r => ({
      code:        r.code,
      heure:       r.heure + ' – ' + r.heureFin,
      client:      r.client,
      telephone:   r.telephone,
      statut:      r.statut,
      encaisse:    Number(r.encaisse),
      reste:       Number(r.montantTotal) - Number(r.encaisse),
    }));

    const totalEncaisse = reservations.reduce((s, r) => s + r.encaisse, 0);
    const totalDu       = rows.reduce((s, r) => s + Number(r.montantTotal), 0);

    return {
      date:           labelDate,
      nbReservations: reservations.length,
      totalEncaisse,
      totalReste:     totalDu - totalEncaisse,
      reservations,
    };
  }

  async genererRecapJournalier(date: string): Promise<Buffer> {
    // ── Récupérer les données ──────────────────────────────────────────────
    const dateObj  = new Date(date + 'T00:00:00');
    const fin      = date + ' 23:59:59';
    const debut    = date + ' 00:00:00';

    const reservations: any[] = await this.ds.query(`
      SELECT
        r.id,
        r.code_confirmation             AS code,
        DATE_FORMAT(c.debut, '%H:%i')   AS heure,
        DATE_FORMAT(c.fin,   '%H:%i')   AS heureFin,
        CONCAT(u.prenom, ' ', u.nom)    AS client,
        u.telephone,
        r.statut,
        r.montant_total                 AS montantTotal,
        COALESCE(SUM(CASE WHEN p.statut='VALIDE' THEN p.montant ELSE 0 END), 0) AS encaisse,
        MAX(p.mode)                     AS mode
      FROM reservations r
      INNER JOIN creneaux     c ON c.id = r.creneau_id
      INNER JOIN utilisateurs u ON u.id = r.utilisateur_id
      LEFT  JOIN paiements    p ON p.reservation_id = r.id
      WHERE c.debut BETWEEN ? AND ?
        AND r.statut IN ('CONFIRMEE', 'EN_ATTENTE')
      GROUP BY r.id, r.code_confirmation, c.debut, c.fin,
               u.prenom, u.nom, u.telephone, r.statut, r.montant_total
      ORDER BY c.debut ASC
    `, [debut, fin]);

    const totalEncaisse = reservations.reduce((s: number, r: any) => s + Number(r.encaisse), 0);
    const totalDu       = reservations.reduce((s: number, r: any) => s + Number(r.montantTotal), 0);
    const totalReste    = totalDu - totalEncaisse;

    const labelDate = dateObj.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // ── Générer le PDF ─────────────────────────────────────────────────────
    return new Promise((resolve, reject) => {
      const doc    = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W   = doc.page.width - 80;  // largeur utile
      const COL = { H: 40, C: 140, T: 300, S: 380, E: 450, R: 520 };

      // ── En-tête ──────────────────────────────────────────────────────────
      // Bande verte
      doc.rect(0, 0, doc.page.width, 90).fill('#1A7A4E');

      doc.fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .fontSize(22)
         .text('TERRAIN DAKAR', 40, 20);

      doc.fontSize(11).font('Helvetica')
         .text('Récapitulatif journalier des réservations', 40, 48);

      doc.fontSize(13).font('Helvetica-Bold')
         .text(labelDate.charAt(0).toUpperCase() + labelDate.slice(1), 40, 66);

      // Date de génération
      doc.fontSize(8).font('Helvetica').fillColor('rgba(255,255,255,0.7)')
         .text('Généré le ' + new Date().toLocaleString('fr-FR'), 40, doc.page.height - 15,
               { align: 'right' });

      // ── KPIs ─────────────────────────────────────────────────────────────
      const kpiY = 105;
      const kpiW = (W - 20) / 3;

      const kpis = [
        { label: 'Réservations', val: String(reservations.length), color: '#1A7A4E' },
        { label: 'Encaissé',     val: fmt(totalEncaisse) + ' FCFA', color: '#1A7A4E' },
        { label: 'Reste à payer',val: fmt(totalReste) + ' FCFA',    color: totalReste > 0 ? '#CC0000' : '#1A7A4E' },
      ];

      kpis.forEach((k, i) => {
        const x = 40 + i * (kpiW + 10);
        doc.roundedRect(x, kpiY, kpiW, 52, 6)
           .strokeColor('#E5E7EB').lineWidth(1).stroke();
        doc.fillColor('#6B7280').font('Helvetica').fontSize(8)
           .text(k.label.toUpperCase(), x + 10, kpiY + 8);
        doc.fillColor(k.color).font('Helvetica-Bold').fontSize(14)
           .text(k.val, x + 10, kpiY + 24, { width: kpiW - 20 });
      });

      // ── Tableau ───────────────────────────────────────────────────────────
      const tableY = kpiY + 70;

      // En-tête tableau
      doc.rect(40, tableY, W, 22).fill('#1A7A4E');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
      const hdrs = [
        { x: COL.H, label: 'HEURE' },
        { x: COL.C, label: 'CLIENT' },
        { x: COL.T, label: 'TÉLÉPHONE' },
        { x: COL.S, label: 'STATUT' },
        { x: COL.E, label: 'ENCAISSÉ' },
        { x: COL.R, label: 'RESTE' },
      ];
      hdrs.forEach(h => doc.text(h.label, h.x, tableY + 7));

      // Lignes
      let y = tableY + 22;
      const ROW_H = 28;

      if (reservations.length === 0) {
        doc.fillColor('#6B7280').font('Helvetica').fontSize(10)
           .text('Aucune réservation pour cette journée.', 40, y + 10, { width: W, align: 'center' });
      }

      reservations.forEach((r: any, i: number) => {
        const bg    = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
        const reste = Number(r.montantTotal) - Number(r.encaisse);

        doc.rect(40, y, W, ROW_H).fill(bg);

        // Heure
        doc.fillColor('#1A7A4E').font('Helvetica-Bold').fontSize(9)
           .text(r.heure + ' – ' + r.heureFin, COL.H, y + 5, { width: 90 });

        // Client
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
           .text(r.client, COL.C, y + 5, { width: 150 });
        doc.fillColor('#6B7280').font('Helvetica').fontSize(7.5)
           .text(r.code, COL.C, y + 16, { width: 150 });

        // Téléphone
        doc.fillColor('#374151').font('Helvetica').fontSize(9)
           .text(r.telephone, COL.T, y + 10, { width: 70 });

        // Statut badge
        const statutColor = r.statut === 'CONFIRMEE' ? '#1A7A4E' : '#B45309';
        const statutLabel = r.statut === 'CONFIRMEE' ? 'Confirmée' : 'En attente';
        doc.roundedRect(COL.S, y + 6, 60, 15, 4).fill(statutColor + '22');
        doc.fillColor(statutColor).font('Helvetica-Bold').fontSize(7.5)
           .text(statutLabel, COL.S + 4, y + 10, { width: 55, align: 'center' });

        // Encaissé
        doc.fillColor('#1A7A4E').font('Helvetica-Bold').fontSize(9)
           .text(fmt(Number(r.encaisse)) + ' F', COL.E, y + 10, { width: 60, align: 'right' });

        // Reste
        doc.fillColor(reste > 0 ? '#CC0000' : '#6B7280')
           .font('Helvetica-Bold').fontSize(9)
           .text(reste > 0 ? fmt(reste) + ' F' : '—', COL.R, y + 10, { width: 55, align: 'right' });

        // Séparateur
        doc.moveTo(40, y + ROW_H).lineTo(40 + W, y + ROW_H)
           .strokeColor('#E5E7EB').lineWidth(0.5).stroke();

        y += ROW_H;
      });

      // ── Ligne totaux ──────────────────────────────────────────────────────
      y += 4;
      doc.rect(40, y, W, 24).fill('#F3F4F6');
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
         .text('TOTAUX', COL.H, y + 7);
      doc.fillColor('#1A7A4E').font('Helvetica-Bold').fontSize(9)
         .text(fmt(totalEncaisse) + ' F', COL.E, y + 7, { width: 60, align: 'right' });
      doc.fillColor(totalReste > 0 ? '#CC0000' : '#1A7A4E').font('Helvetica-Bold').fontSize(9)
         .text(totalReste > 0 ? fmt(totalReste) + ' F' : '✓ Soldé', COL.R, y + 7, { width: 55, align: 'right' });

      // ── Mode de paiement résumé ───────────────────────────────────────────
      y += 40;
      doc.fillColor('#6B7280').font('Helvetica').fontSize(8)
         .text('* Modes de paiement : Sur place = cash / Wave / Orange Money / Free Money', 40, y);

      // ── Pied de page ──────────────────────────────────────────────────────
      doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill('#1A7A4E');
      doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8)
         .text('Terrain Dakar  —  Document confidentiel à usage interne',
               40, doc.page.height - 20, { align: 'center', width: doc.page.width - 80 });

      doc.end();
    });
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n));
}
