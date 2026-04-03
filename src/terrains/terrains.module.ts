import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Terrain } from '../common/entities/terrain.entity';
import { TerrainsController } from './terrains.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Terrain])],
  controllers: [TerrainsController],
})
export class TerrainsModule {}
