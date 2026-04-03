import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';

const VERT   = '1A7A4E';
const BLANC  = 'FFFFFFFF';
const JAUNE  = 'FFFFF3CD';
const ROUGE  = 'FFFEE2E2';
const VERT_C = 'FFD6F0E4';
const BLEU_C = 'FFDBEAFE';
const GRIS   = 'FFF5F5F5';

function hdr(cell: ExcelJS.Cell, bg = VERT, fg = BLANC) {
  cell.font      = { bold: true, color: { argb: fg }, name: 'Arial', size: 10 };
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border    = thin();
}

function thin(): ExcelJS.Borders {
  const s: ExcelJS.Border = { style: 'thin', color: { argb: 'FFCCCCCC' } };
  return { left: s, right: s, top: s, bottom: s, diagonal: {} };
}

function money(cell: ExcelJS.Cell, val: number, bold = false, color = '000000') {
  cell.value         = val;
  cell.numFmt        = '#,##0 "FCFA"';
  cell.font          = { bold, color: { argb: 'FF' + color }, name: 'Arial', size: 10 };
  cell.alignment     = { horizontal: 'right' };
  cell.border        = thin();
}

function txt(cell: ExcelJS.Cell, val: any, bold = false, color = '000000',
             center = false, bgArgb?: string) {
  cell.value     = val ?? '';
  cell.font      = { bold, color: { argb: 'FF' + color }, name: 'Arial', size: 10 };
  cell.alignment = { horizontal: center ? 'center' : 'left', vertical: 'middle', wrapText: true };
  cell.border    = thin();
  if (bgArgb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
}

@Injectable()
export class ExcelService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  async genererRapportReservations(debut: string, fin: string): Promise<Buffer> {
    const finInclus = fin + ' 23:59:59';

    // ── Données ────────────────────────────────────────────────────────────
    const reservations: any[] = await this.ds.query(`
      SELECT r.id, r.code_confirmation AS code,
             DATE_FORMAT(c.debut,'%d/%m/%Y') AS date,
             DATE_FORMAT(c.debut,'%H:%i')    AS heure,
             CONCAT(u.prenom,' ',u.nom)      AS client,
             u.telephone, r.statut,
             r.montant_total                 AS montantTotal
      FROM reservations r
      INNER JOIN creneaux     c ON c.id = r.creneau_id
      INNER JOIN utilisateurs u ON u.id = r.utilisateur_id
      WHERE c.debut BETWEEN ? AND ?
        AND (
          r.statut IN ('CONFIRMEE', 'EN_ATTENTE')
          OR (r.statut IN ('ANNULEE') AND EXISTS (
            SELECT 1 FROM paiements p WHERE p.reservation_id = r.id AND p.statut = 'VALIDE'
          ))
        )
      ORDER BY c.debut ASC
    `, [debut, finInclus]);

    const paiements: any[] = await this.ds.query(`
      SELECT p.reservation_id AS resaId,
             p.type_paiement  AS type,
             p.montant,
             p.mode,
             DATE_FORMAT(p.paid_at,'%d/%m/%Y') AS datePaiement,
             p.statut
      FROM paiements p
      WHERE p.reservation_id IN (
        SELECT r.id FROM reservations r
        INNER JOIN creneaux c ON c.id = r.creneau_id
        WHERE c.debut BETWEEN ? AND ?
      ) AND p.statut = 'VALIDE'
      ORDER BY p.paid_at ASC
    `, [debut, finInclus]);

    // Indexer paiements par resaId
    const paiMap = new Map<number, any[]>();
    for (const p of paiements) {
      if (!paiMap.has(p.resaId)) paiMap.set(p.resaId, []);
      paiMap.get(p.resaId).push(p);
    }

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Terrain Dakar';
    wb.created  = new Date();

    // ══════════════════════════════════════════════════════════════════════
    // FEUILLE 1 — RÉSERVATIONS
    // ══════════════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('Réservations');
    ws1.properties.defaultRowHeight = 20;

    ws1.mergeCells('A1:L1');
    const t1 = ws1.getCell('A1');
    t1.value = 'TERRAIN DAKAR — RAPPORT DES RÉSERVATIONS  |  ' + debut + ' au ' + fin;
    t1.font  = { bold: true, size: 13, color: { argb: BLANC }, name: 'Arial' };
    t1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + VERT } };
    t1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 30;

    ws1.addRow([]);

    const hdrs1 = ['Code', 'Date', 'Heure', 'Client', 'Téléphone', 'Statut',
                   'Montant dû', 'Encaissé', 'Reste', 'Nb paiements', 'Mode(s)', 'Notes'];
    const hr1 = ws1.addRow(hdrs1);
    hr1.eachCell(c => hdr(c));
    hr1.height = 24;

    const statutBg: Record<string, string> = {
      CONFIRMEE: VERT_C, EN_ATTENTE: JAUNE, ANNULEE: ROUGE, EXPIREE: GRIS,
    };
    const statutLbl: Record<string, string> = {
      CONFIRMEE: 'Confirmée', EN_ATTENTE: 'En attente', ANNULEE: 'Annulée', EXPIREE: 'Expirée',
    };

    let totalDu = 0, totalEnc = 0;
    const dataStartRow1 = ws1.rowCount + 1;

    for (const r of reservations) {
      const pai       = paiMap.get(r.id) ?? [];
      const encaisse  = pai.reduce((s: number, p: any) => s + Number(p.montant), 0);
      const reste     = Number(r.montantTotal) - encaisse;
      const modes     = [...new Set(pai.map((p: any) => p.mode))].join(', ') || '—';
      const bg        = 'FF' + (statutBg[r.statut] ?? 'FFFFFFFF').replace(/^FF/, '');
      const notes     = reste > 0 && encaisse > 0 ? 'Acompte — solde en attente'
                      : encaisse === 0 ? 'Aucun paiement' : '';

      const row = ws1.addRow([]);
      txt(row.getCell(1),  r.code,                    true,  VERT,     false, bg);
      txt(row.getCell(2),  r.date,                    false, '000000', true,  bg);
      txt(row.getCell(3),  r.heure,                   false, '000000', true,  bg);
      txt(row.getCell(4),  r.client,                  true,  '000000', false, bg);
      txt(row.getCell(5),  r.telephone,               false, '000000', false, bg);
      txt(row.getCell(6),  statutLbl[r.statut] ?? r.statut, true, '000000', true, bg);
      money(row.getCell(7),  Number(r.montantTotal));
      money(row.getCell(8),  encaisse, encaisse >= Number(r.montantTotal), VERT);
      money(row.getCell(9),  reste,    reste > 0, reste > 0 ? 'CC0000' : VERT);
      txt(row.getCell(10), pai.length,               false, '000000', true);
      txt(row.getCell(11), modes);
      txt(row.getCell(12), notes,                    false, '666666');

      totalDu  += Number(r.montantTotal);
      totalEnc += encaisse;
    }

    // Totaux
    ws1.addRow([]);
    const totRow1 = ws1.addRow([]);
    totRow1.getCell(6).value = 'TOTAUX';
    totRow1.getCell(6).font  = { bold: true, name: 'Arial' };
    totRow1.getCell(6).alignment = { horizontal: 'right' };
    const endRow1 = ws1.rowCount - 1;
    for (const [col, f] of [[7, `SUM(G${dataStartRow1}:G${endRow1})`],
                             [8, `SUM(H${dataStartRow1}:H${endRow1})`],
                             [9, `SUM(I${dataStartRow1}:I${endRow1})`]] as [number, string][]) {
      const c = totRow1.getCell(col);
      c.value = { formula: f } as any;
      c.numFmt = '#,##0 "FCFA"';
      c.font   = { bold: true, color: { argb: 'FF' + VERT }, name: 'Arial' };
      c.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERT_C } };
      c.alignment = { horizontal: 'right' };
      c.border = thin();
    }

    ws1.columns = [
      { width: 22 }, { width: 13 }, { width: 8 }, { width: 22 }, { width: 14 },
      { width: 13 }, { width: 16 }, { width: 16 }, { width: 16 },
      { width: 12 }, { width: 18 }, { width: 26 },
    ];
    ws1.views = [{ state: 'frozen', ySplit: 3 }];

    // ══════════════════════════════════════════════════════════════════════
    // FEUILLE 2 — DÉTAIL PAIEMENTS
    // ══════════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('Détail Paiements');

    ws2.mergeCells('A1:H1');
    const t2 = ws2.getCell('A1');
    t2.value = 'TERRAIN DAKAR — DÉTAIL DES PAIEMENTS';
    t2.font  = { bold: true, size: 13, color: { argb: BLANC }, name: 'Arial' };
    t2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + VERT } };
    t2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 30;
    ws2.addRow([]);

    const hr2 = ws2.addRow(['Code', 'Client', 'Date créneau', 'Type', 'Date paiement', 'Mode', 'Montant', 'Cumul']);
    hr2.eachCell(c => hdr(c));
    hr2.height = 24;

    const typeBg: Record<string, string>  = { ACOMPTE: JAUNE, SOLDE: VERT_C, TOTAL: BLEU_C };
    const typeLbl: Record<string, string> = { ACOMPTE: 'Acompte', SOLDE: 'Solde', TOTAL: 'Total' };
    const dataStart2 = ws2.rowCount + 1;

    for (const r of reservations) {
      const pai = paiMap.get(r.id) ?? [];
      if (pai.length === 0) {
        const row = ws2.addRow([]);
        txt(row.getCell(1), r.code, true, VERT);
        txt(row.getCell(2), r.client);
        txt(row.getCell(3), r.date, false, '000000', true);
        for (let c = 4; c <= 8; c++) txt(row.getCell(c), '—', false, '999999', true);
      } else {
        let cumul = 0;
        for (let i = 0; i < pai.length; i++) {
          const p  = pai[i];
          cumul   += Number(p.montant);
          const bg = 'FF' + (typeBg[p.type] ?? 'FFFFFFFF').replace(/^FF/, '');
          const row = ws2.addRow([]);
          txt(row.getCell(1), i === 0 ? r.code    : '', i === 0, VERT);
          txt(row.getCell(2), i === 0 ? r.client  : '');
          txt(row.getCell(3), i === 0 ? r.date    : '', false, '000000', true);
          txt(row.getCell(4), typeLbl[p.type] ?? p.type, true, '000000', true, bg);
          txt(row.getCell(5), p.datePaiement, false, '000000', true, bg);
          txt(row.getCell(6), p.mode, false, '000000', true, bg);
          money(row.getCell(7), Number(p.montant));
          money(row.getCell(8), cumul, cumul >= Number(r.montantTotal), VERT);
        }
      }
    }

    ws2.addRow([]);
    const totRow2 = ws2.addRow([]);
    totRow2.getCell(6).value = 'TOTAL ENCAISSÉ';
    totRow2.getCell(6).font  = { bold: true, name: 'Arial' };
    totRow2.getCell(6).alignment = { horizontal: 'right' };
    const endRow2 = ws2.rowCount - 1;
    const ct = totRow2.getCell(7);
    ct.value = { formula: `SUM(G${dataStart2}:G${endRow2})` } as any;
    ct.numFmt = '#,##0 "FCFA"';
    ct.font   = { bold: true, color: { argb: 'FF' + VERT }, name: 'Arial' };
    ct.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERT_C } };
    ct.alignment = { horizontal: 'right' };
    ct.border = thin();

    ws2.columns = [
      { width: 22 }, { width: 22 }, { width: 13 }, { width: 16 },
      { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 },
    ];
    ws2.views = [{ state: 'frozen', ySplit: 3 }];

    // ══════════════════════════════════════════════════════════════════════
    // FEUILLE 3 — RÉSUMÉ CLIENTS
    // ══════════════════════════════════════════════════════════════════════
    const ws3 = wb.addWorksheet('Résumé Clients');

    ws3.mergeCells('A1:G1');
    const t3 = ws3.getCell('A1');
    t3.value = 'TERRAIN DAKAR — RÉSUMÉ PAR CLIENT';
    t3.font  = { bold: true, size: 13, color: { argb: BLANC }, name: 'Arial' };
    t3.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + VERT } };
    t3.alignment = { horizontal: 'center', vertical: 'middle' };
    ws3.getRow(1).height = 30;
    ws3.addRow([]);

    const hr3 = ws3.addRow(['Client', 'Téléphone', 'Nb résa.',
                             'Montant dû', 'Encaissé', 'Reste', 'Statut']);
    hr3.eachCell(c => hdr(c));
    hr3.height = 24;

    // Agréger par client
    const clientMap = new Map<string, any>();
    for (const r of reservations) {
      const k = r.telephone;
      if (!clientMap.has(k))
        clientMap.set(k, { nom: r.client, tel: r.telephone, nb: 0, du: 0, enc: 0 });
      const cl = clientMap.get(k);
      cl.nb  += 1;
      cl.du  += Number(r.montantTotal);
      cl.enc += (paiMap.get(r.id) ?? []).reduce((s: number, p: any) => s + Number(p.montant), 0);
    }

    const dataStart3 = ws3.rowCount + 1;
    for (const cl of clientMap.values()) {
      const reste = cl.du - cl.enc;
      const bg    = reste <= 0 ? VERT_C : cl.enc > 0 ? JAUNE : ROUGE;
      const lbl   = reste <= 0 ? '✓ Soldé' : `Reste ${reste.toLocaleString('fr-FR')} FCFA`;
      const row   = ws3.addRow([]);
      txt(row.getCell(1), cl.nom,  true);
      txt(row.getCell(2), cl.tel);
      txt(row.getCell(3), cl.nb,   false, '000000', true);
      money(row.getCell(4), cl.du);
      money(row.getCell(5), cl.enc, true, VERT);
      money(row.getCell(6), reste, reste > 0, reste > 0 ? 'CC0000' : VERT);
      txt(row.getCell(7), lbl, true, '000000', true, 'FF' + bg.replace(/^FF/, ''));
    }

    ws3.addRow([]);
    const totRow3 = ws3.addRow([]);
    totRow3.getCell(2).value = 'TOTAUX';
    totRow3.getCell(2).font  = { bold: true, name: 'Arial' };
    const endRow3 = ws3.rowCount - 1;
    for (const [col, f] of [[4, `SUM(D${dataStart3}:D${endRow3})`],
                             [5, `SUM(E${dataStart3}:E${endRow3})`],
                             [6, `SUM(F${dataStart3}:F${endRow3})`]] as [number, string][]) {
      const c = totRow3.getCell(col);
      c.value = { formula: f } as any;
      c.numFmt = '#,##0 "FCFA"';
      c.font   = { bold: true, color: { argb: 'FF' + VERT }, name: 'Arial' };
      c.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERT_C } };
      c.alignment = { horizontal: 'right' };
      c.border = thin();
    }

    ws3.columns = [
      { width: 24 }, { width: 16 }, { width: 12 },
      { width: 18 }, { width: 18 }, { width: 18 }, { width: 22 },
    ];
    ws3.views = [{ state: 'frozen', ySplit: 3 }];

    // ── Export Buffer ──────────────────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer();
    return buf as unknown as Buffer;
  }
}
