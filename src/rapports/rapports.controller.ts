import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { PdfService } from './pdf.service';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';
import { RapportsService } from './rapports.service';

@ApiTags('Rapports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CAISSIER)
@Controller('rapports')
export class RapportsController {
  constructor(
    private service: RapportsService,
    private excel: ExcelService,
    private pdf: PdfService,
  ) {}

  // GET /api/rapports?debut=2026-03-01&fin=2026-03-31
  @Get()
  async getRapport(
    @Query('debut') debut: string,
    @Query('fin')   fin:   string,
  ) {
    return this.service.generer({ debut, fin });
  }

  // GET /api/rapports/excel?debut=YYYY-MM-DD&fin=YYYY-MM-DD
  @Get('excel')
  async exportExcel(
    @Query('debut') debut: string,
    @Query('fin')   fin:   string,
    @Res() res: Response,
  ) {
    const buffer   = await this.excel.genererRapportReservations(debut, fin);
    const filename = 'rapport-reservations-' + debut + '-' + fin + '.xlsx';
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(buffer);
  }

  // GET /api/rapports/apercu-journalier?date=YYYY-MM-DD (données JSON)
  @Get('apercu-journalier')
  async apercuJournalier(@Query('date') date: string) {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.pdf.getApercuJournalier(d);
  }

  // GET /api/rapports/pdf-journalier?date=YYYY-MM-DD
  @Get('pdf-journalier')
  async pdfJournalier(
    @Query('date') date: string,
    @Res() res: Response,
  ) {
    const d      = date || new Date().toISOString().slice(0, 10);
    const buffer = await this.pdf.genererRecapJournalier(d);
    const fname  = 'recap-reservations-' + d + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
    res.send(buffer);
  }

  // GET /api/rapports/csv?debut=...&fin=...
  @Get('csv')
  async exportCSV(
    @Query('debut') debut: string,
    @Query('fin')   fin:   string,
    @Res() res: Response,
  ) {
    const data = await this.service.generer({ debut, fin });
    const csv  = this.service.genererCSV(data);
    const filename = 'rapport-' + debut + '-' + fin + '.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send('\uFEFF' + csv); // BOM UTF-8 pour Excel
  }
}
