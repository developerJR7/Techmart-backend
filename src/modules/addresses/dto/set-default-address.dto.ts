import { IsString } from 'class-validator';

export class SetDefaultAddressDto {
  @IsString()
  addressId: string;
}
