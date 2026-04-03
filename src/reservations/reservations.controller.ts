import { Controller, Post, Get, Patch, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { ReservationsService } from './reservations.service';
import { CreerReservationDto } from './reservations.dto';
import { Utilisateur } from '../common/entities/utilisateur.entity';

@ApiTags('Réservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private service: ReservationsService) {}

  @Post()
  creer(@Body() dto: CreerReservationDto, @CurrentUser() user: Utilisateur) {
    return this.service.creer(dto, user);
  }

  @Get('mes-reservations')
  mesReservations(@CurrentUser() user: Utilisateur) {
    return this.service.mesReservations(user.id);
  }

  @Get('code/:code')
  parCode(@Param('code') code: string) {
    return this.service.trouverParCode(code);
  }

  @Patch(':id/annuler')
  annuler(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Utilisateur) {
    return this.service.annuler(id, user);
  }

  @Patch(':id/annuler-admin')
  @Roles(Role.ADMIN, Role.CAISSIER)
  annulerAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.service.annulerParAdmin(id);
  }

  @Post('admin/reserver')
  @Roles(Role.ADMIN, Role.CAISSIER)
  reserverPourClient(@Body() dto: {
    terrainId: number;
    debut: string;
    telephone: string;
    nom?: string;
    prenom?: string;
    notes?: string;
  }) {
    return this.service.reserverPourClient(dto);
  }
}
