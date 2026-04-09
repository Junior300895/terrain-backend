import { Module } from '@nestjs/common';
import { RapportsService } from './rapports.service';
import { RapportsController } from './rapports.controller';
import { ExcelService } from './excel.service';
import { PdfService } from './pdf.service';

@Module({
  providers: [RapportsService, ExcelService, PdfService],
  controllers: [RapportsController],
})
export class RapportsModule {}
