import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Depense } from '../common/entities/depense.entity';
import { DepensesService } from './depenses.service';
import { DepensesController } from './depenses.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Depense]),
  ],
  providers: [DepensesService],
  controllers: [DepensesController],
  exports: [DepensesService],
})
export class DepensesModule {}
