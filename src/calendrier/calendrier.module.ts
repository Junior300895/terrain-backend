import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Creneau } from '../common/entities/creneau.entity';
import { Reservation } from '../common/entities/reservation.entity';
import { Terrain } from '../common/entities/terrain.entity';
import { Paiement } from '../common/entities/paiement.entity';
import { CalendrierService } from './calendrier.service';
import { CalendrierController } from './calendrier.controller';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [TypeOrmModule.forFeature([Creneau, Reservation, Terrain, Paiement]), ReservationsModule],
  providers: [CalendrierService],
  controllers: [CalendrierController],
})
export class CalendrierModule {}
