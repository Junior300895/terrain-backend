import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paiement } from '../common/entities/paiement.entity';
import { Reservation } from '../common/entities/reservation.entity';
import { ModePaiement, StatutPaiement, StatutReservation } from '../common/enums';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class PaiementsService {
  private readonly logger = new Logger(PaiementsService.name);

  constructor(
    @InjectRepository(Paiement)    private paiementRepo: Repository<Paiement>,
    @InjectRepository(Reservation) private resaRepo: Repository<Reservation>,
    private whatsapp: WhatsappService,
  ) {}

  // Valider ou créer le premier paiement (acompte ou total)
  async validerParReservation(
    reservationId: number,
    mode: ModePaiement = ModePaiement.SUR_PLACE,
    montantVerse?: number,
  ): Promise<{ paiement: Paiement; totalPaye: number; resteAPayer: number }> {
    const resa = await this.resaRepo.findOne({
      where: { id: reservationId },
      relations: ['creneau', 'creneau.terrain', 'utilisateur'],
    });
    if (!resa) throw new NotFoundException('Réservation ' + reservationId + ' introuvable');
    if ([StatutReservation.ANNULEE, StatutReservation.EXPIREE].includes(resa.statut))
      throw new BadRequestException('Impossible de payer une réservation ' + resa.statut.toLowerCase());

    const montantTotal = Number(resa.montantTotal);
    const dejaPaye = await this.getTotalPaye(reservationId);

    if (dejaPaye >= montantTotal)
      throw new BadRequestException('Cette réservation est déjà intégralement payée');

    const montantFinal = (montantVerse && montantVerse > 0)
      ? Math.min(montantVerse, montantTotal - dejaPaye)
      : montantTotal - dejaPaye;

    const resteAvantPaiement = montantTotal - dejaPaye;
    const typePaiement = montantFinal < resteAvantPaiement ? 'ACOMPTE' : (dejaPaye > 0 ? 'SOLDE' : 'TOTAL');

    const paiement = this.paiementRepo.create({
      reservationId,
      montant: montantFinal,
      mode,
      statut: StatutPaiement.VALIDE,
      typePaiement,
      paidAt: new Date(),
      notes: typePaiement === 'ACOMPTE'
        ? 'Acompte: ' + montantFinal.toLocaleString('fr-FR') + ' FCFA — Reste: ' + (resteAvantPaiement - montantFinal).toLocaleString('fr-FR') + ' FCFA'
        : typePaiement === 'SOLDE'
        ? 'Solde: ' + montantFinal.toLocaleString('fr-FR') + ' FCFA — Réservation soldée'
        : null,
    });
    await this.paiementRepo.save(paiement);

    const totalPaye     = dejaPaye + montantFinal;
    const resteAPayer   = montantTotal - totalPaye;

    // Confirmer la réservation si le montant total est atteint
    if (totalPaye >= montantTotal && resa.statut !== StatutReservation.CONFIRMEE) {
      resa.statut = StatutReservation.CONFIRMEE;
      await this.resaRepo.save(resa);
      await this.envoyerWhatsapp(resa);
    } else if (resa.statut !== StatutReservation.CONFIRMEE) {
      // Acompte partiel — confirmer quand même pour bloquer le créneau
      resa.statut = StatutReservation.CONFIRMEE;
      await this.resaRepo.save(resa);
    }

    return { paiement, totalPaye, resteAPayer };
  }

  // Ajouter un paiement complémentaire (solde) sur une résa déjà confirmée
  async ajouterSolde(
    reservationId: number,
    mode: ModePaiement = ModePaiement.SUR_PLACE,
    montantVerse?: number,
  ): Promise<{ paiement: Paiement; totalPaye: number; resteAPayer: number }> {
    const resa = await this.resaRepo.findOne({
      where: { id: reservationId },
      relations: ['creneau', 'creneau.terrain', 'utilisateur'],
    });
    if (!resa) throw new NotFoundException('Réservation introuvable');
    if (resa.statut !== StatutReservation.CONFIRMEE)
      throw new BadRequestException('La réservation doit être confirmée pour ajouter un solde');

    const montantTotal = Number(resa.montantTotal);
    const dejaPaye     = await this.getTotalPaye(reservationId);
    const reste        = montantTotal - dejaPaye;

    if (reste <= 0)
      throw new BadRequestException('Cette réservation est déjà intégralement payée (' + montantTotal.toLocaleString('fr-FR') + ' FCFA)');

    const montantFinal = (montantVerse && montantVerse > 0)
      ? Math.min(montantVerse, reste)
      : reste;

    const typePaiement = montantFinal >= reste ? 'SOLDE' : 'ACOMPTE';

    const paiement = this.paiementRepo.create({
      reservationId,
      montant: montantFinal,
      mode,
      statut: StatutPaiement.VALIDE,
      typePaiement,
      paidAt: new Date(),
      notes: typePaiement === 'SOLDE'
        ? 'Solde: ' + montantFinal.toLocaleString('fr-FR') + ' FCFA — Réservation soldée'
        : 'Paiement partiel: ' + montantFinal.toLocaleString('fr-FR') + ' FCFA — Reste: ' + (reste - montantFinal).toLocaleString('fr-FR') + ' FCFA',
    });
    await this.paiementRepo.save(paiement);

    return {
      paiement,
      totalPaye:  dejaPaye + montantFinal,
      resteAPayer: reste - montantFinal,
    };
  }

  // Récupérer tous les paiements d'une réservation
  async getPaiementsReservation(reservationId: number): Promise<{
    paiements: Paiement[];
    totalPaye: number;
    resteAPayer: number;
    montantTotal: number;
  }> {
    const resa = await this.resaRepo.findOne({ where: { id: reservationId } });
    if (!resa) throw new NotFoundException('Réservation introuvable');

    const paiements = await this.paiementRepo.find({
      where: { reservationId, statut: StatutPaiement.VALIDE },
      order: { paidAt: 'ASC' },
    });

    const totalPaye   = paiements.reduce((s, p) => s + Number(p.montant), 0);
    const montantTotal = Number(resa.montantTotal);

    return {
      paiements,
      totalPaye,
      resteAPayer: Math.max(0, montantTotal - totalPaye),
      montantTotal,
    };
  }

  async getTotalPaye(reservationId: number): Promise<number> {
    const paiements = await this.paiementRepo.find({
      where: { reservationId, statut: StatutPaiement.VALIDE },
    });
    return paiements.reduce((s, p) => s + Number(p.montant), 0);
  }

  private async envoyerWhatsapp(resa: any) {
    if (!resa.utilisateur?.telephone) return;
    try {
      const debut = new Date(resa.creneau.debut);
      const dateHeure = debut.toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long',
      }) + ' à ' + debut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      await this.whatsapp.envoyerConfirmationReservation({
        telephone:        resa.utilisateur.telephone,
        clientPrenom:     resa.utilisateur.prenom,
        codeConfirmation: resa.codeConfirmation,
        nomTerrain:       resa.creneau.terrain?.nom ?? 'Terrain Principal',
        dateHeure,
        montant: new Intl.NumberFormat('fr-FR').format(Number(resa.montantTotal)),
      });
    } catch (_) {}
  }
}
