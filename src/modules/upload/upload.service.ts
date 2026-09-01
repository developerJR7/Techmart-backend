import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';
import { getErrorMessage } from '../../common/utils/error.util';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private configService: ConfigService) {
    // Configurar Cloudinary
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.logger.log('Cloudinary configured successfully');
    } else {
      this.logger.warn('Cloudinary not configured - using fallback');
    }
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');

    if (!cloudName) {
      // Fallback: retornar URL simulada
      this.logger.warn('Cloudinary not configured, returning mock URL');
      return `https://via.placeholder.com/400x400.png?text=${encodeURIComponent(file.originalname)}`;
    }

    try {
      return await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'techmart',
            resource_type: 'image',
          },
          (error, result) => {
            if (error) {
              this.logger.error(`Cloudinary upload failed: ${error.message}`);
              reject(new Error(error.message));
            } else if (result) {
              this.logger.log(
                `Image uploaded successfully: ${result.secure_url}`,
              );
              resolve(result.secure_url);
            } else {
              this.logger.error('Cloudinary upload failed: No result returned');
              reject(new Error('Upload failed: No result returned'));
            }
          },
        );

        streamifier.createReadStream(file.buffer).pipe(uploadStream);
      });
    } catch (error) {
      this.logger.error(`Failed to upload image: ${getErrorMessage(error)}`);
      throw error;
    }
  }
}
