import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Utilisateur } from '../common/entities/utilisateur.entity';
import { Role } from '../common/enums';
import { InscriptionDto, ConnexionDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Utilisateur) private utilisateurRepo: Repository<Utilisateur>,
    private jwt: JwtService,
  ) {}

  async inscrire(dto: InscriptionDto) {
    if (await this.utilisateurRepo.findOne({ where: { telephone: dto.telephone } }))
      throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
    if (dto.email && await this.utilisateurRepo.findOne({ where: { email: dto.email } }))
      throw new ConflictException('Cet email est déjà utilisé');

    const motDePasse = await bcrypt.hash(dto.motDePasse, 12);
    const user = this.utilisateurRepo.create({ ...dto, motDePasse, role: Role.CLIENT });
    await this.utilisateurRepo.save(user);
    return this.buildResponse(user);
  }

  async connecter(dto: ConnexionDto) {
    const user = await this.utilisateurRepo.findOne({ where: { telephone: dto.telephone } });
    if (!user || !(await bcrypt.compare(dto.motDePasse, user.motDePasse)))
      throw new UnauthorizedException('Téléphone ou mot de passe incorrect');
    if (!user.actif) throw new UnauthorizedException('Compte désactivé');
    return this.buildResponse(user);
  }

  private buildResponse(user: Utilisateur) {
    const token = this.jwt.sign({ sub: user.id, telephone: user.telephone, role: user.role });
    return {
      token, type: 'Bearer', id: user.id,
      nom: user.nom, prenom: user.prenom,
      telephone: user.telephone, email: user.email, role: user.role,
    };
  }
}
