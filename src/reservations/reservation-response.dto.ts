import { Reservation } from '../common/entities/reservation.entity';
import { Paiement } from '../common/entities/paiement.entity';
import { CreneauResponseDto } from '../creneaux/creneaux.dto';

// Mappe exactement le modèle Angular Reservation
export class ReservationResponseDto {
  id: number;
  codeConfirmation: string;
  statut: string;
  montantTotal: number;
  notes: string;
  createdAt: string;
  utilisateur: {
    id: number; nom: string; prenom: string;
    telephone: string; email: string; role: string;
  };
  creneau: CreneauResponseDto;
  paiement?: {
    id: number; montant: number; mode: string;
    statut: string; referenceExterne: string; paidAt: string;
  };

  static fromEntity(r: Reservation, paiement?: Paiement): ReservationResponseDto {
    return {
      id: r.id,
      codeConfirmation: r.codeConfirmation,
      statut: r.statut,
      montantTotal: Number(r.montantTotal),
      notes: r.notes,
      createdAt: r.createdAt?.toISOString(),
      utilisateur: r.utilisateur ? {
        id: r.utilisateur.id,
        nom: r.utilisateur.nom,
        prenom: r.utilisateur.prenom,
        telephone: r.utilisateur.telephone,
        email: r.utilisateur.email,
        role: r.utilisateur.role,
      } : undefined,
      creneau: r.creneau ? CreneauResponseDto.fromEntity(r.creneau) : undefined,
      paiement: paiement ? {
        id: paiement.id,
        montant: Number(paiement.montant),
        mode: paiement.mode,
        statut: paiement.statut,
        referenceExterne: paiement.referenceExterne,
        paidAt: paiement.paidAt?.toISOString(),
      } : undefined,
    };
  }
}
