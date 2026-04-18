import {
  Controller, Get, Post, Delete, Param, Query, Body,
  UseGuards, UseInterceptors, UploadedFile, Res,
  ParseIntPipe, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { memoryStorage } from 'multer';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';
import { DepensesService } from './depenses.service';
import { CategorieDepense, StatutDepense } from '../common/entities/depense.entity';

@ApiTags('Dépenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CAISSIER)
@Controller('depenses')
export class DepensesController {
  constructor(
    private service: DepensesService,
    private config: ConfigService,
  ) {
    // Configurer Cloudinary
    cloudinary.config({
      cloud_name:  this.config.get('CLOUDINARY_CLOUD_NAME'),
      api_key:     this.config.get('CLOUDINARY_API_KEY'),
      api_secret:  this.config.get('CLOUDINARY_API_SECRET'),
    });
  }

  @Get()
  findAll(
    @Query('debut') debut?: string,
    @Query('fin')   fin?:   string,
    @Query('categorie') categorie?: string,
  ) {
    return this.service.findAll({ debut, fin, categorie });
  }

  @Post()
  @UseInterceptors(FileInterceptor('fichier', {
    storage: memoryStorage(), // Garder en mémoire pour uploader vers Cloudinary
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new BadRequestException('Format non supporté (JPG, PNG, PDF uniquement)'), false);
    },
  }))
  async creer(
    @Body() body: any,
    @UploadedFile() fichier?: Express.Multer.File,
  ) {
    let cloudinaryResult: any = null;

    // Uploader vers Cloudinary si fichier présent
    if (fichier) {
      try {
        cloudinaryResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder:        'terrain-dakar/factures',
              resource_type: 'auto',
              public_id:     'facture-' + Date.now(),
              access_mode:   'public',
            },
            (error, result) => {
              if (error) {
                console.error('Cloudinary error:', JSON.stringify(error));
                reject(new Error(error?.message ?? 'Cloudinary upload failed'));
              } else {
                resolve(result);
              }
            },
          );
          uploadStream.end(fichier.buffer);
        });
      } catch (err: any) {
        // Si Cloudinary échoue (ex: credentials manquants), on continue sans fichier
        console.error('Upload Cloudinary ignoré:', err?.message);
        cloudinaryResult = null;
      }
    }

    return this.service.creer({
      categorie:        body.categorie as CategorieDepense,
      montant:          Number(body.montant),
      dateDepense:      body.dateDepense,
      description:      body.description,
      referenceFacture: body.referenceFacture,
      statut:           (body.statut as StatutDepense) ?? StatutDepense.PAYEE,
    }, fichier, cloudinaryResult);
  }

  @Get(':id/url-signee')
  async urlSignee(@Param('id', ParseIntPipe) id: number) {
    const dep = await this.service.findOne(id);
    if (!dep.fichierUrl) return { url: null };

    // Extraire le public_id depuis les notes
    let publicId = '';
    let resourceType = 'auto';
    if (dep.notes) {
      try {
        const meta = JSON.parse(dep.notes);
        publicId     = meta.cloudinary_id ?? '';
        resourceType = meta.resource_type ?? 'auto';
      } catch (_) {}
    }

    if (!publicId) {
      // Fallback : retourner l'URL directe
      return { url: dep.fichierUrl };
    }

    // Générer URL signée valable 1 heure
    const signedUrl = cloudinary.utils.private_download_url(publicId, '', {
      resource_type: resourceType,
      type:          'upload',
      expires_at:    Math.floor(Date.now() / 1000) + 3600,
      attachment:    false,
    });

    return { url: signedUrl };
  }

  @Get(':id/url-signee')
  async getUrlSignee(@Param('id', ParseIntPipe) id: number) {
    const dep = await this.service.findOne(id);
    if (!dep.fichierUrl) return { url: null };

    // Extraire le public_id depuis les notes
    let publicId = null;
    let resourceType = 'auto';
    if (dep.notes) {
      try {
        const meta = JSON.parse(dep.notes);
        publicId     = meta.cloudinary_id;
        resourceType = meta.resource_type ?? 'auto';
      } catch (_) {}
    }

    if (!publicId) return { url: dep.fichierUrl };

    // Générer URL signée valable 1 heure
    // Pour les PDFs (raw), utiliser private_download_url
    // Pour les images, utiliser cloudinary.url avec sign_url
    let signedUrl: string;
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;

    if (resourceType === 'raw') {
      signedUrl = cloudinary.utils.private_download_url(publicId, 'pdf', {
        resource_type: 'raw',
        expires_at:    expiresAt,
        attachment:    false,
      });
    } else {
      signedUrl = cloudinary.url(publicId, {
        resource_type: resourceType as any,
        sign_url:      true,
        secure:        true,
        expires_at:    expiresAt,
      });
    }

    return { url: signedUrl };
  }

  @Delete(':id')
  async supprimer(@Param('id', ParseIntPipe) id: number) {
    return this.service.supprimer(id);
  }
}
