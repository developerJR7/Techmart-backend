import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplySellerDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
