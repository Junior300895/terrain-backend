import { Controller, Post, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, ModePaiement } from '../common/enums';
import { PaiementsService } from './paiements.service';

@ApiTags('Paiements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CAISSIER)
@Controller('paiements')
export class PaiementsController {
  constructor(private service: PaiementsService) {}

  // Premier paiement (acompte ou total)
  @Post('valider-reservation/:id')
  valider(
    @Param('id', ParseIntPipe) id: number,
    @Query('mode') mode: ModePaiement = ModePaiement.SUR_PLACE,
    @Query('montant') montant?: string,
  ) {
    const montantVerse = montant ? parseFloat(montant) : undefined;
    return this.service.validerParReservation(id, mode, montantVerse);
  }

  // Paiement complémentaire (solde)
  @Post('solde-reservation/:id')
  ajouterSolde(
    @Param('id', ParseIntPipe) id: number,
    @Query('mode') mode: ModePaiement = ModePaiement.SUR_PLACE,
    @Query('montant') montant?: string,
  ) {
    const montantVerse = montant ? parseFloat(montant) : undefined;
    return this.service.ajouterSolde(id, mode, montantVerse);
  }

  // Historique des paiements d'une réservation
  @Get('reservation/:id')
  getPaiements(@Param('id', ParseIntPipe) id: number) {
    return this.service.getPaiementsReservation(id);
  }
}
