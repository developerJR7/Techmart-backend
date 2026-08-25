import { PartialType } from '@nestjs/swagger';
import { CreateReviewDto } from './create-review.dto';
import { OmitType } from '@nestjs/swagger';

export class UpdateReviewDto extends PartialType(
  OmitType(CreateReviewDto, ['productId'] as const),
) {}
