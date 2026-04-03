import { Module } from '@nestjs/common';
import { RapportsService } from './rapports.service';
import { RapportsController } from './rapports.controller';
import { ExcelService } from './excel.service';

@Module({
  providers: [RapportsService, ExcelService],
  controllers: [RapportsController],
})
export class RapportsModule {}
