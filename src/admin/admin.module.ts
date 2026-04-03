import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from '../common/entities/reservation.entity';
import { Paiement } from '../common/entities/paiement.entity';
import { Creneau } from '../common/entities/creneau.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, Paiement, Creneau]), ReservationsModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
