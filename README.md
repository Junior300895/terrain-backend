# ⚽ Terrain Dakar — Backend NestJS

API REST NestJS en remplacement du backend Spring Boot.
**Stack** : NestJS 10 · TypeScript · TypeORM · MySQL 8 · Passport JWT

---

## Comparaison avec Spring Boot

| Aspect         | Spring Boot (Java 17) | NestJS (TypeScript)    |
|---------------|----------------------|------------------------|
| Langage        | Java                 | TypeScript = Angular   |
| Démarrage      | ~15s (JVM warmup)    | ~2s                    |
| Image Docker   | ~300 MB              | ~80 MB                 |
| ORM            | Hibernate/JPA        | TypeORM                |
| Auth           | Spring Security      | Passport + JWT         |
| Swagger        | SpringDoc            | @nestjs/swagger natif  |
| Scheduler      | @Scheduled           | @nestjs/schedule Cron  |

---

## Démarrage rapide

```bash
# Avec Docker (MySQL + NestJS)
docker-compose up --build

# API disponible sur : http://localhost:3000/api
# Swagger UI sur    : http://localhost:3000/api/docs
```

## Développement local

```bash
# Prérequis : Node 20+, MySQL 8 local

# 1. Installer les dépendances
npm install

# 2. Configurer .env
cp .env.example .env   # éditer DB_HOST, DB_USER, DB_PASSWORD

# 3. Démarrer en mode watch
npm run start:dev
```

---

## Architecture

```
src/
├── common/
│   ├── entities/          # Toutes les entités TypeORM
│   │   ├── utilisateur.entity.ts
│   │   ├── terrain.entity.ts
│   │   ├── creneau.entity.ts
│   │   ├── reservation.entity.ts
│   │   └── paiement.entity.ts
│   ├── enums.ts           # Tous les enums partagés
│   ├── guards/            # JwtAuthGuard, RolesGuard
│   ├── decorators/        # @CurrentUser, @Roles
│   └── filters/           # GlobalExceptionFilter
│
├── auth/                  # Inscription, connexion, JWT strategy
├── creneaux/              # CRUD créneaux, bloquer/libérer
├── reservations/          # Créer, annuler, mes réservations + scheduler
├── paiements/             # Valider paiement
├── calendrier/            # Grille visuelle + réservation directe
├── admin/                 # Dashboard KPIs + liste réservations
├── app.module.ts
└── main.ts
```

---

## Endpoints principaux

| Méthode | URL | Auth | Description |
|---------|-----|------|-------------|
| POST | /api/auth/inscription | Public | Créer un compte |
| POST | /api/auth/connexion | Public | Obtenir JWT |
| GET | /api/calendrier/semaine/:id?lundi=YYYY-MM-DD | Public | Grille semaine |
| POST | /api/calendrier/reserver | CLIENT | Réserver un créneau |
| GET | /api/reservations/mes-reservations | CLIENT | Mes réservations |
| PATCH | /api/reservations/:id/annuler | CLIENT | Annuler (EN_ATTENTE seulement) |
| PATCH | /api/reservations/:id/annuler-admin | ADMIN/CAISSIER | Annuler (tout statut) |
| POST | /api/paiements/valider-reservation/:id | ADMIN/CAISSIER | Valider paiement |
| GET | /api/admin/dashboard | ADMIN/CAISSIER | KPIs |
| GET | /api/admin/reservations | ADMIN/CAISSIER | Toutes les réservations |

## Variables d'environnement (production)

```env
DB_HOST=your-db-host
DB_DATABASE=football_db
DB_USERNAME=football_user
DB_PASSWORD=VotreMotDePasseFort
JWT_SECRET=VotreCleSecreteMin256Bits
NODE_ENV=production
```

> ⚠️ En production, `NODE_ENV=production` désactive `synchronize: true` — utilisez des migrations TypeORM.

---

## Mise à jour du frontend Angular

Changer l'URL de l'API dans `frontend/src/environments/environment.ts` :

```typescript
// Avant (Spring Boot)
apiUrl: 'http://localhost:8080/api'

// Après (NestJS)
apiUrl: 'http://localhost:3000/api'
```
