import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('retorna o usuário com o campo avatar', async () => {
      const user = { id: 'user-a', name: 'A', email: 'a@a.com', avatar: null };
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne('user-a');

      expect(result).toEqual(user);
    });

    it('lança NotFoundException se o usuário não existir', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // Regressão do bug de perfil/avatar: o id sempre vem de req.user.id (nunca
  // de um parâmetro de rota), então não há como alterar o perfil de outro
  // usuário por esta função.
  describe('updateProfile', () => {
    it('atualiza nome e avatar do próprio usuário', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-a' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-a',
        name: 'Novo Nome',
        avatar: 'https://cdn.example.com/avatar.png',
      });

      const result = await service.updateProfile('user-a', {
        name: 'Novo Nome',
        avatar: 'https://cdn.example.com/avatar.png',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-a' },
        data: {
          name: 'Novo Nome',
          avatar: 'https://cdn.example.com/avatar.png',
        },
        select: expect.objectContaining({ id: true, avatar: true }),
      });
      expect(result.name).toBe('Novo Nome');
    });

    it('lança NotFoundException se o usuário do token não existir mais', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('deleted-user', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
