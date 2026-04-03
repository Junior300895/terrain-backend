import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Terrain } from '../common/entities/terrain.entity';

@ApiTags('Terrains')
@Controller('terrains')
export class TerrainsController {
  constructor(
    @InjectRepository(Terrain) private terrainRepo: Repository<Terrain>,
  ) {}

  @Get()
  getAll() {
    return this.terrainRepo.find({ where: { actif: true } });
  }

  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.terrainRepo.findOne({ where: { id } });
  }
}
