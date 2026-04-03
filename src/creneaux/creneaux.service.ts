import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { DataSource } from 'typeorm';
import { Creneau } from '../common/entities/creneau.entity';
import { Terrain } from '../common/entities/terrain.entity';
import { StatutCreneau } from '../common/enums';
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { CreneauResponseDto } from './creneaux.dto';

export class CreerCreneauDto {
  @IsNumber() terrainId: number;
  @IsNotEmpty() debut: string;
  @IsNotEmpty() fin: string;
  @IsOptional() prixSpecial?: number;
  @IsOptional() statut?: StatutCreneau;
}

export class BloquerHeureDto {
  @IsNumber() terrainId: number;
  @IsNotEmpty() date: string;  // YYYY-MM-DD
  @IsNumber() heure: number;   // 0-23
}

@Injectable()
export class CreneauxService {
  constructor(
    @InjectRepository(Creneau)  private creneauRepo: Repository<Creneau>,
    @InjectRepository(Terrain)  private terrainRepo: Repository<Terrain>,
    private dataSource: DataSource,
  ) {}

  async getDisponibles(terrainId: number): Promise<CreneauResponseDto[]> {
    const creneaux = await this.creneauRepo.find({
      where: { terrain: { id: terrainId }, statut: StatutCreneau.DISPONIBLE },
      relations: ['terrain'],
      order: { debut: 'ASC' },
    });
    return creneaux.map(CreneauResponseDto.fromEntity);
  }

  async getParSemaine(terrainId: number, debut: Date): Promise<CreneauResponseDto[]> {
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 7);
    const creneaux = await this.creneauRepo.find({
      where: { terrain: { id: terrainId }, debut: Between(debut, fin) },
      relations: ['terrain'],
      order: { debut: 'ASC' },
    });
    return creneaux.map(CreneauResponseDto.fromEntity);
  }

  // Bloquer une heure directement — crée le créneau si besoin via SQL direct
  async bloquerHeure(dto: BloquerHeureDto): Promise<{ message: string }> {
    const { terrainId, date, heure } = dto;
    const [y, m, d] = date.split('-').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');

    const debutStr = y + '-' + pad(m) + '-' + pad(d) + ' ' + pad(heure) + ':00:00';
    const finH     = heure === 23 ? 0 : heure + 1;
    const finDate  = heure === 23 ? new Date(y, m - 1, d + 1) : new Date(y, m - 1, d);
    const finStr   = finDate.getFullYear() + '-' + pad(finDate.getMonth()+1) + '-' + pad(finDate.getDate()) +
                     ' ' + pad(finH) + ':00:00';

    // Chercher un créneau existant sur cette heure
    const existing: any[] = await this.dataSource.query(
      `SELECT id, statut FROM creneaux
       WHERE terrain_id = ? AND DATE_FORMAT(debut, '%Y-%m-%d %H') = ?
       LIMIT 1`,
      [terrainId, y + '-' + pad(m) + '-' + pad(d) + ' ' + pad(heure)],
    );

    if (existing.length > 0) {
      if (existing[0].statut === StatutCreneau.RESERVE)
        throw new BadRequestException('Ce créneau est déjà réservé');
      // Mettre à jour le statut
      await this.dataSource.query(
        'UPDATE creneaux SET statut = ? WHERE id = ?',
        [StatutCreneau.BLOQUE, existing[0].id],
      );
    } else {
      // Créer + bloquer directement
      await this.dataSource.query(
        'INSERT INTO creneaux (terrain_id, debut, fin, statut, created_at) VALUES (?, ?, ?, ?, NOW())',
        [terrainId, debutStr, finStr, StatutCreneau.BLOQUE],
      );
    }
    return { message: 'Créneau bloqué' };
  }

  async liberer(id: number): Promise<{ message: string }> {
    const exists = await this.dataSource.query(
      'SELECT id FROM creneaux WHERE id = ?', [id]
    );
    if (!exists.length) throw new NotFoundException('Créneau introuvable');
    await this.dataSource.query(
      'UPDATE creneaux SET statut = ? WHERE id = ?',
      [StatutCreneau.DISPONIBLE, id],
    );
    return { message: 'Créneau libéré' };
  }

  async bloquer(id: number): Promise<{ message: string }> {
    const rows: any[] = await this.dataSource.query(
      'SELECT id, statut FROM creneaux WHERE id = ?', [id]
    );
    if (!rows.length) throw new NotFoundException('Créneau introuvable');
    if (rows[0].statut === StatutCreneau.RESERVE)
      throw new BadRequestException('Ce créneau est déjà réservé');
    await this.dataSource.query(
      'UPDATE creneaux SET statut = ? WHERE id = ?',
      [StatutCreneau.BLOQUE, id],
    );
    return { message: 'Créneau bloqué' };
  }

  async creer(dto: CreerCreneauDto): Promise<CreneauResponseDto> {
    const terrain = await this.terrainRepo.findOne({ where: { id: dto.terrainId } });
    if (!terrain) throw new NotFoundException('Terrain introuvable');
    const debut = new Date(dto.debut);
    const fin   = new Date(dto.fin);
    if (fin <= debut) throw new BadRequestException('La fin doit être après le début');
    const pad = (n: number) => String(n).padStart(2, '0');
    const toStr = (dt: Date) => dt.getFullYear() + '-' + pad(dt.getMonth()+1) + '-' + pad(dt.getDate()) +
                                ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':00';
    const result = await this.dataSource.query(
      'INSERT INTO creneaux (terrain_id, debut, fin, statut, created_at) VALUES (?, ?, ?, ?, NOW())',
      [dto.terrainId, toStr(debut), toStr(fin), dto.statut ?? StatutCreneau.DISPONIBLE],
    );
    const created = await this.creneauRepo.findOne({
      where: { id: result.insertId }, relations: ['terrain']
    });
    return CreneauResponseDto.fromEntity(created);
  }
}
