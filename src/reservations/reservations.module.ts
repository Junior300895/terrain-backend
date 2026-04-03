import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from '../common/entities/reservation.entity';
import { Creneau } from '../common/entities/creneau.entity';
import { Paiement } from '../common/entities/paiement.entity';
import { ReservationsService } from './reservations.service';

import { ReservationsController } from './reservations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, Creneau, Paiement])],
  providers: [ReservationsService],
  controllers: [ReservationsController],
  exports: [ReservationsService],
})
export class ReservationsModule {}
