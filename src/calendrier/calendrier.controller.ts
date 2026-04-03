import { Controller, Get, Post, Param, Query, Body, UseGuards, ParseIntPipe, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Utilisateur } from '../common/entities/utilisateur.entity';
import { CalendrierService } from './calendrier.service';
import { ReservationsService } from '../reservations/reservations.service';
import { IsNotEmpty, IsDateString, IsOptional } from 'class-validator';

class ReserverDirectDto {
  @IsNotEmpty() terrainId: number;
  @IsNotEmpty() debut: string;
  @IsOptional() notes?: string;
}

@ApiTags('Calendrier')
@Controller('calendrier')
export class CalendrierController {
  constructor(
    private calendrierService: CalendrierService,
    private reservationsService: ReservationsService,
  ) {}

  @Get('semaine/:terrainId')
  async getSemaine(
    @Param('terrainId', ParseIntPipe) terrainId: number,
    @Query('lundi') lundiStr: string,
  ) {
    // Parser YYYY-MM-DD en date LOCALE (new Date('YYYY-MM-DD') parse en UTC et décale d'un jour)
    const [year, month, day] = lundiStr.split('-').map(Number);
    const lundi = new Date(year, month - 1, day, 0, 0, 0, 0);
    return this.calendrierService.getSemaine(terrainId, lundi);
  }

  @Post('reserver')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async reserver(@Body() dto: ReserverDirectDto, @CurrentUser() user: Utilisateur) {
    const [datePart, timePart] = dto.debut.split('T');
    const [dy, dm, dd] = datePart.split('-').map(Number);
    const [dh, dmin] = (timePart ?? '00:00').split(':').map(Number);
    const debutLocal = new Date(dy, dm - 1, dd, dh, dmin ?? 0, 0, 0);

    // creerOuTrouverCreneau peut lancer une Error si créneau déjà réservé/bloqué
    // On la convertit en BadRequestException pour une réponse HTTP 400 propre
    let creneauId: number;
    try {
      creneauId = await this.calendrierService.creerOuTrouverCreneau(dto.terrainId, debutLocal);
    } catch (err) {
      throw new (await import('@nestjs/common')).BadRequestException(err.message);
    }
    return this.reservationsService.creer({ creneauId, notes: dto.notes }, user);
  }
}
