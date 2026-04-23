import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { Depense, CategorieDepense, StatutDepense } from '../common/entities/depense.entity';

@Injectable()
export class DepensesService {
  constructor(
    @InjectRepository(Depense) private repo: Repository<Depense>,
  ) {}

  async creer(
    dto: {
      categorie: CategorieDepense;
      montant: number;
      dateDepense: string;
      description: string;
      referenceFacture?: string;
      statut?: StatutDepense;
    },
    fichier?: Express.Multer.File,
    cloudinaryResult?: any,
  ): Promise<Depense> {
    const dep = this.repo.create({
      ...dto,
      montant:    Number(dto.montant),
      fichierNom: fichier?.originalname ?? null,
      fichierUrl: cloudinaryResult?.secure_url ?? null,
      // Stocker public_id dans notes pour permettre la suppression Cloudinary
      notes: cloudinaryResult?.public_id
        ? JSON.stringify({
            cloudinary_id:  cloudinaryResult.public_id,
            resource_type:  cloudinaryResult.resource_type ?? 'image', // valeur réelle retournée par Cloudinary
          })
        : null,
    });
    return this.repo.save(dep);
  }

  async findAll(params: { debut?: string; fin?: string; categorie?: string }): Promise<{
    depenses: Depense[];
    totalDepenses: number;
  }> {
    const qb = this.repo.createQueryBuilder('d').orderBy('d.dateDepense', 'DESC');
    if (params.debut && params.fin) {
      qb.where('d.dateDepense BETWEEN :debut AND :fin', { debut: params.debut, fin: params.fin });
    } else if (params.debut) {
      qb.where('d.dateDepense >= :debut', { debut: params.debut });
    }
    if (params.categorie) qb.andWhere('d.categorie = :cat', { cat: params.categorie });

    const depenses = await qb.getMany();
    const totalDepenses = depenses
      .filter(d => d.statut === StatutDepense.PAYEE)
      .reduce((s, d) => s + Number(d.montant), 0);

    return { depenses, totalDepenses };
  }

  async findOne(id: number): Promise<Depense> {
    const dep = await this.repo.findOne({ where: { id } });
    if (!dep) throw new NotFoundException('Dépense introuvable');
    return dep;
  }

  async modifier(
    id: number,
    dto: Partial<{ categorie: CategorieDepense; montant: number; dateDepense: string; description: string; referenceFacture: string; statut: StatutDepense }>,
    fichier?: Express.Multer.File,
    cloudinaryResult?: any,
  ): Promise<Depense> {
    const dep = await this.findOne(id);
    if (dto.categorie)        dep.categorie        = dto.categorie;
    if (dto.montant)          dep.montant          = dto.montant;
    if (dto.dateDepense)      dep.dateDepense      = dto.dateDepense;
    if (dto.description)      dep.description      = dto.description;
    if (dto.referenceFacture !== undefined) dep.referenceFacture = dto.referenceFacture;
    if (dto.statut)           dep.statut           = dto.statut;
    if (cloudinaryResult?.secure_url) {
      dep.fichierNom = fichier?.originalname ?? dep.fichierNom;
      dep.fichierUrl = cloudinaryResult.secure_url;
      dep.notes = JSON.stringify({
        cloudinary_id: cloudinaryResult.public_id,
        resource_type: cloudinaryResult.resource_type ?? 'image',
      });
    }
    return this.repo.save(dep);
  }

  async supprimer(id: number): Promise<void> {
    const dep = await this.findOne(id);

    if (dep.notes) {
      try {
        const meta = JSON.parse(dep.notes);
        if (meta.cloudinary_id) {
          // Essayer avec le resource_type stocké, puis image, puis raw
          const resourceTypes = [meta.resource_type, 'image', 'raw', 'video'].filter(Boolean);
          let supprime = false;
          for (const rt of resourceTypes) {
            try {
              const result = await cloudinary.uploader.destroy(meta.cloudinary_id, {
                resource_type: rt,
              });
              console.log(`Cloudinary destroy (${rt}):`, result.result);
              if (result.result === 'ok') { supprime = true; break; }
            } catch (_) {}
          }
          if (!supprime) console.warn('Cloudinary : fichier non supprimé pour', meta.cloudinary_id);
        }
      } catch (e: any) {
        console.warn('Cloudinary destroy erreur:', e?.message);
      }
    }

    await this.repo.delete(id);
  }
}
