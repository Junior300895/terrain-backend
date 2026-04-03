import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Creneau } from '../common/entities/creneau.entity';
import { Terrain } from '../common/entities/terrain.entity';
import { CreneauxService } from './creneaux.service';
import { CreneauxController } from './creneaux.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Creneau, Terrain])],
  providers: [CreneauxService],
  controllers: [CreneauxController],
  exports: [CreneauxService],
})
export class CreneauxModule {}
