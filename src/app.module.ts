import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';

import { Utilisateur } from './common/entities/utilisateur.entity';
import { Terrain } from './common/entities/terrain.entity';
import { Creneau } from './common/entities/creneau.entity';
import { Reservation } from './common/entities/reservation.entity';
import { Paiement } from './common/entities/paiement.entity';

import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AuthModule } from './auth/auth.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PaiementsModule } from './paiements/paiements.module';
import { CreneauxModule } from './creneaux/creneaux.module';
import { CalendrierModule } from './calendrier/calendrier.module';
import { AdminModule } from './admin/admin.module';
import { DatabaseModule } from './database/database.module';
import { TerrainsModule } from './terrains/terrains.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { RapportsModule } from './rapports/rapports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get('DB_USERNAME', 'root'),
        password: config.get('DB_PASSWORD', 'password'),
        database: config.get('DB_DATABASE', 'football_db'),
        entities: [Utilisateur, Terrain, Creneau, Reservation, Paiement],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
        timezone: 'Africa/Dakar',
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    ReservationsModule,
    PaiementsModule,
    CreneauxModule,
    CalendrierModule,
    AdminModule,
    DatabaseModule,
    TerrainsModule,
    UsersModule,
    WhatsappModule,
    RapportsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
