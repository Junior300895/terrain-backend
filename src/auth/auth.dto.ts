import { IsNotEmpty, IsOptional, IsEmail, MinLength, Matches } from 'class-validator';

export class InscriptionDto {
  @IsNotEmpty({ message: 'Le nom est obligatoire' }) nom: string;
  @IsNotEmpty({ message: 'Le prénom est obligatoire' }) prenom: string;
  @IsNotEmpty() @Matches(/^(\+221|221)?[0-9]{9}$/, { message: 'Numéro sénégalais invalide' }) telephone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsNotEmpty() @MinLength(6) motDePasse: string;
}

export class ConnexionDto {
  @IsNotEmpty() telephone: string;
  @IsNotEmpty() motDePasse: string;
}
