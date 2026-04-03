import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Paiement } from '../common/entities/paiement.entity';
import { Reservation } from '../common/entities/reservation.entity';
import { PaiementsService } from './paiements.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PaiementsController } from './paiements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Paiement, Reservation]), WhatsappModule],
  providers: [PaiementsService],
  controllers: [PaiementsController],
})
export class PaiementsModule {}
