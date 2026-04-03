import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface NotificationReservation {
  id: number;
  codeConfirmation: string;
  clientNom: string;
  clientTelephone: string;
  debut: string;
  montantTotal: number;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  private subject = new Subject<NotificationReservation>();

  // Appelé par ReservationsService à chaque nouvelle réservation
  emettreNouvelleReservation(notif: NotificationReservation) {
    this.subject.next(notif);
  }

  // Flux SSE — chaque admin connecté s'y abonne
  getFlux(): Observable<NotificationReservation> {
    return this.subject.asObservable();
  }
}
