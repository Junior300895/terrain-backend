import { Controller, Get, Sse, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';
import { NotificationsService, NotificationReservation } from './notifications.service';

interface MessageEvent {
  data: string | object;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CAISSIER)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifService: NotificationsService) {}

  @Sse('reservations')
  streamReservations(): Observable<MessageEvent> {
    return this.notifService.getFlux().pipe(
      map((notif: NotificationReservation) => ({
        data: JSON.stringify(notif),
      })),
    );
  }
}
