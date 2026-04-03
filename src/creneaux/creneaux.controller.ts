import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';
import { CreneauxService, CreerCreneauDto, BloquerHeureDto } from './creneaux.service';

@ApiTags('Créneaux')
@Controller('creneaux')
export class CreneauxController {
  constructor(private service: CreneauxService) {}

  @Get('disponibles/:terrainId')
  getDisponibles(@Param('terrainId', ParseIntPipe) id: number) {
    return this.service.getDisponibles(id);
  }

  @Get('semaine/:terrainId')
  getSemaine(
    @Param('terrainId', ParseIntPipe) terrainId: number,
    @Query('debut') debutStr: string,
  ) {
    const [datePart, timePart] = debutStr.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [h, min] = (timePart ?? '00:00').split(':').map(Number);
    const debut = new Date(y, m - 1, d, h, min ?? 0, 0, 0);
    return this.service.getParSemaine(terrainId, debut);
  }

  @Post('bloquer-heure')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CAISSIER)
  bloquerHeure(@Body() dto: BloquerHeureDto) {
    return this.service.bloquerHeure(dto);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CAISSIER)
  creer(@Body() dto: CreerCreneauDto) {
    return this.service.creer(dto);
  }

  @Patch(':id/bloquer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CAISSIER)
  bloquer(@Param('id', ParseIntPipe) id: number) {
    return this.service.bloquer(id);
  }

  @Patch(':id/liberer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.CAISSIER)
  liberer(@Param('id', ParseIntPipe) id: number) {
    return this.service.liberer(id);
  }
}
