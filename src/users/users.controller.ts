import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";

@ApiTags("Utilisateurs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CAISSIER)
@Controller("utilisateurs")
export class UsersController {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  @Get("recherche")
  async rechercher(@Query("telephone") telephone: string) {
    if (!telephone || telephone.length < 3) return [];
    const rows: any[] = await this.dataSource.query(
      `SELECT id, nom, prenom, telephone FROM utilisateurs
       WHERE (telephone LIKE ? OR CONCAT(prenom, ' ', nom) LIKE ?)
         AND actif = 1
       ORDER BY prenom, nom
       LIMIT 10`,
      ["%" + telephone + "%", "%" + telephone + "%"],
    );
    return rows;
  }
}
