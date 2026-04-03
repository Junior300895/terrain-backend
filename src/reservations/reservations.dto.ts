import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
export class CreerReservationDto {
  @IsNotEmpty() @IsNumber() creneauId: number;
  @IsOptional() @IsString() notes?: string;
}
