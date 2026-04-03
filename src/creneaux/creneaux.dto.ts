import { Creneau } from '../common/entities/creneau.entity';

// DTO de réponse qui correspond exactement au modèle Angular Creneau
export class CreneauResponseDto {
  id: number;
  terrainId: number;
  terrainNom: string;
  debut: string;
  fin: string;
  statut: string;
  prixEffectif: number;
  dureeHeures: number;

  static fromEntity(c: Creneau): CreneauResponseDto {
    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocalISO = (d: Date) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}` +
             `T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
    };
    return {
      id: c.id,
      terrainId: c.terrain?.id,
      terrainNom: c.terrain?.nom,
      debut: toLocalISO(new Date(c.debut)),
      fin: toLocalISO(new Date(c.fin)),
      statut: c.statut,
      prixEffectif: c.prixEffectif,
      dureeHeures: c.dureeHeures,
    };
  }
}
