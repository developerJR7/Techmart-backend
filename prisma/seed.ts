import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // ============================================
  // USUÁRIOS
  // ============================================

  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@techmart.com' },
    update: {},
    create: {
      email: 'admin@techmart.com',
      name: 'Admin TechMart',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const userPassword = await bcrypt.hash('user123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'user@techmart.com' },
    update: {},
    create: {
      email: 'user@techmart.com',
      name: 'Usuário Teste',
      password: userPassword,
      role: 'CUSTOMER',
    },
  });

  console.log('✅ Usuários criados');

  // ============================================
  // CATEGORIAS
  // ============================================

  const categories = [
    {
      name: 'Smartphones',
      slug: 'smartphones',
      description: 'Celulares e smartphones de última geração',
      image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400',
    },
    {
      name: 'Notebooks',
      slug: 'notebooks',
      description: 'Notebooks e laptops para trabalho e entretenimento',
      image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400',
    },
    {
      name: 'Tablets',
      slug: 'tablets',
      description: 'Tablets para produtividade e lazer',
      image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400',
    },
    {
      name: 'Smartwatches',
      slug: 'smartwatches',
      description: 'Relógios inteligentes e wearables',
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
    },
    {
      name: 'Fones de Ouvido',
      slug: 'fones-de-ouvido',
      description: 'Fones, headphones e earbuds',
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
    },
    {
      name: 'Monitores',
      slug: 'monitores',
      description: 'Monitores para PC e gaming',
      image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400',
    },
    {
      name: 'Teclados',
      slug: 'teclados',
      description: 'Teclados mecânicos e para escritório',
      image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400',
    },
    {
      name: 'Mouses',
      slug: 'mouses',
      description: 'Mouses gamer e para produtividade',
      image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=400',
    },
    {
      name: 'Câmeras',
      slug: 'cameras',
      description: 'Câmeras fotográficas e de vídeo',
      image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400',
    },
    {
      name: 'Consoles',
      slug: 'consoles',
      description: 'Consoles de videogame',
      image: 'https://images.unsplash.com/photo-1486401899868-0e435ed85128?w=400',
    },
    {
      name: 'Acessórios',
      slug: 'acessorios',
      description: 'Acessórios diversos para tecnologia',
      image: 'https://images.unsplash.com/photo-1625948515291-69613efd103f?w=400',
    },
  ];

  const createdCategories: any[] = [];
  for (const category of categories) {
    const cat = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
    createdCategories.push(cat);
  }

  console.log('✅ Categorias criadas');

  // ============================================
  // PRODUTOS (50+)
  // ============================================

  const products = [
    // SMARTPHONES
    {
      name: 'iPhone 15 Pro Max',
      slug: 'iphone-15-pro-max',
      description: 'O iPhone mais avançado com chip A17 Pro, câmera de 48MP com zoom óptico de 5x, tela Super Retina XDR de 6.7 polegadas com ProMotion 120Hz, e estrutura em titânio.',
      price: 8999.99,
      stock: 50,
      categoryId: createdCategories[0].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800',
      images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800', 'https://images.unsplash.com/photo-1695048064236-1b2c8c6e4e4f?w=800'],
      metaTitle: 'iPhone 15 Pro Max - Compre Agora | TechMart',
      metaDescription: 'iPhone 15 Pro Max com chip A17 Pro e câmera profissional. Parcele em até 12x sem juros.',
    },
    {
      name: 'Samsung Galaxy S24 Ultra',
      slug: 'samsung-galaxy-s24-ultra',
      description: 'Smartphone premium com S Pen integrada, câmera de 200MP, tela Dynamic AMOLED 2X de 6.8 polegadas, processador Snapdragon 8 Gen 3 e bateria de 5000mAh.',
      price: 7999.99,
      stock: 40,
      categoryId: createdCategories[0].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800',
      images: ['https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800'],
    },
    {
      name: 'Google Pixel 8 Pro',
      slug: 'google-pixel-8-pro',
      description: 'Pixel com IA avançada, câmera computacional de última geração, tela OLED de 6.7 polegadas 120Hz, e 7 anos de atualizações garantidas.',
      price: 6499.99,
      stock: 35,
      categoryId: createdCategories[0].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800',
    },
    {
      name: 'Xiaomi 14 Pro',
      slug: 'xiaomi-14-pro',
      description: 'Flagship com câmera Leica, Snapdragon 8 Gen 3, carregamento rápido de 120W, tela AMOLED de 6.73 polegadas e design premium.',
      price: 4999.99,
      stock: 60,
      categoryId: createdCategories[0].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1592286927505-b0c2e8d6e2d4?w=800',
    },
    {
      name: 'OnePlus 12',
      slug: 'oneplus-12',
      description: 'Performance extrema com Snapdragon 8 Gen 3, tela AMOLED 120Hz, carregamento de 100W e sistema de câmera Hasselblad.',
      price: 5499.99,
      stock: 45,
      categoryId: createdCategories[0].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800',
    },

    // NOTEBOOKS
    {
      name: 'MacBook Pro 16" M3 Max',
      slug: 'macbook-pro-16-m3-max',
      description: 'MacBook Pro com chip M3 Max, 36GB RAM, 1TB SSD, tela Liquid Retina XDR, bateria de até 22 horas. Performance profissional para criadores.',
      price: 24999.99,
      stock: 20,
      categoryId: createdCategories[1].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800',
      images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800'],
    },
    {
      name: 'Dell XPS 15',
      slug: 'dell-xps-15',
      description: 'Notebook premium com Intel Core i9 13ª geração, RTX 4070, 32GB RAM, tela OLED 4K touchscreen de 15.6 polegadas.',
      price: 14999.99,
      stock: 25,
      categoryId: createdCategories[1].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800',
    },
    {
      name: 'Lenovo ThinkPad X1 Carbon Gen 11',
      slug: 'lenovo-thinkpad-x1-carbon-gen11',
      description: 'Ultrabook corporativo com Intel Core i7, 16GB RAM, 512GB SSD, tela 14" 2.8K, peso de apenas 1.12kg e bateria de longa duração.',
      price: 9999.99,
      stock: 30,
      categoryId: createdCategories[1].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800',
    },
    {
      name: 'ASUS ROG Zephyrus G16',
      slug: 'asus-rog-zephyrus-g16',
      description: 'Notebook gamer com RTX 4090, Intel Core i9, 32GB RAM, tela ROG Nebula Display 240Hz, design fino e leve.',
      price: 18999.99,
      stock: 15,
      categoryId: createdCategories[1].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800',
    },
    {
      name: 'HP Spectre x360 14',
      slug: 'hp-spectre-x360-14',
      description: 'Conversível 2-em-1 premium com tela OLED touchscreen, Intel Evo i7, 16GB RAM, caneta HP Stylus incluída.',
      price: 11999.99,
      stock: 20,
      categoryId: createdCategories[1].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=800',
    },
    {
      name: 'Acer Swift 3',
      slug: 'acer-swift-3',
      description: 'Notebook custo-benefício com AMD Ryzen 7, 16GB RAM, 512GB SSD, tela Full HD de 14 polegadas, leve e portátil.',
      price: 4499.99,
      stock: 50,
      categoryId: createdCategories[1].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1484788984921-03950022c9ef?w=800',
    },

    // TABLETS
    {
      name: 'iPad Pro 12.9" M2',
      slug: 'ipad-pro-12-9-m2',
      description: 'iPad Pro com chip M2, tela Liquid Retina XDR, suporte para Apple Pencil (2ª geração) e Magic Keyboard. Perfeito para criação profissional.',
      price: 10999.99,
      stock: 25,
      categoryId: createdCategories[2].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800',
    },
    {
      name: 'Samsung Galaxy Tab S9 Ultra',
      slug: 'samsung-galaxy-tab-s9-ultra',
      description: 'Tablet Android premium com tela AMOLED de 14.6 polegadas, S Pen incluída, resistência à água IP68.',
      price: 8999.99,
      stock: 20,
      categoryId: createdCategories[2].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1585790050230-5dd28404f905?w=800',
    },
    {
      name: 'Microsoft Surface Pro 9',
      slug: 'microsoft-surface-pro-9',
      description: 'Tablet 2-em-1 com Windows 11, Intel Core i7, tela PixelSense de 13 polegadas, Type Cover vendida separadamente.',
      price: 7499.99,
      stock: 18,
      categoryId: createdCategories[2].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1617096200347-cb04ae810b1d?w=800',
    },

    // SMARTWATCHES
    {
      name: 'Apple Watch Series 9',
      slug: 'apple-watch-series-9',
      description: 'Smartwatch com chip S9, tela Always-On Retina, monitoramento avançado de saúde, resistência à água e integração perfeita com iPhone.',
      price: 3999.99,
      stock: 60,
      categoryId: createdCategories[3].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=800',
    },
    {
      name: 'Samsung Galaxy Watch 6 Classic',
      slug: 'samsung-galaxy-watch-6-classic',
      description: 'Relógio inteligente com bisel rotativo, monitoramento de saúde completo, GPS, bateria de longa duração.',
      price: 2499.99,
      stock: 45,
      categoryId: createdCategories[3].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
    },
    {
      name: 'Garmin Fenix 7X',
      slug: 'garmin-fenix-7x',
      description: 'Smartwatch multiesportivo com GPS avançado, mapas topográficos, bateria de até 28 dias, resistência militar.',
      price: 4999.99,
      stock: 25,
      categoryId: createdCategories[3].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800',
    },

    // FONES DE OUVIDO
    {
      name: 'AirPods Pro 2',
      slug: 'airpods-pro-2',
      description: 'Fones com cancelamento ativo de ruído adaptativo, áudio espacial personalizado, resistência à água IPX4 e estojo MagSafe.',
      price: 2199.99,
      stock: 100,
      categoryId: createdCategories[4].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1606841837239-c5a1a4a07af7?w=800',
    },
    {
      name: 'Sony WH-1000XM5',
      slug: 'sony-wh-1000xm5',
      description: 'Headphone over-ear com melhor cancelamento de ruído do mercado, áudio Hi-Res, 30 horas de bateria, conforto premium.',
      price: 1999.99,
      stock: 80,
      categoryId: createdCategories[4].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
    },
    {
      name: 'Bose QuietComfort Ultra',
      slug: 'bose-quietcomfort-ultra',
      description: 'Fones premium com áudio espacial imersivo, cancelamento de ruído de classe mundial, conforto excepcional.',
      price: 2499.99,
      stock: 50,
      categoryId: createdCategories[4].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800',
    },
    {
      name: 'JBL Tune 770NC',
      slug: 'jbl-tune-770nc',
      description: 'Headphone com cancelamento de ruído, bateria de 70 horas, Bluetooth 5.3, ótimo custo-benefício.',
      price: 599.99,
      stock: 120,
      categoryId: createdCategories[4].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1545127398-14699f92334b?w=800',
    },

    // MONITORES
    {
      name: 'LG UltraWide 34" 5K2K',
      slug: 'lg-ultrawide-34-5k2k',
      description: 'Monitor ultrawide 34 polegadas com resolução 5120x2160, HDR10, 98% DCI-P3, Thunderbolt 4, ideal para criadores.',
      price: 5999.99,
      stock: 30,
      categoryId: createdCategories[5].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800',
    },
    {
      name: 'Samsung Odyssey G9',
      slug: 'samsung-odyssey-g9',
      description: 'Monitor gamer curvo 49 polegadas, 240Hz, 1ms, QLED, G-Sync e FreeSync Premium Pro, imersão total.',
      price: 8999.99,
      stock: 15,
      categoryId: createdCategories[5].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1585792180666-f7347c490ee2?w=800',
    },
    {
      name: 'Dell UltraSharp 27" 4K',
      slug: 'dell-ultrasharp-27-4k',
      description: 'Monitor profissional 4K IPS, 99% sRGB, USB-C com 90W de carregamento, altura ajustável.',
      price: 3499.99,
      stock: 40,
      categoryId: createdCategories[5].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=800',
    },
    {
      name: 'ASUS TUF Gaming 27" 165Hz',
      slug: 'asus-tuf-gaming-27-165hz',
      description: 'Monitor gamer Full HD, 165Hz, 1ms, IPS, G-Sync Compatible, excelente custo-benefício.',
      price: 1299.99,
      stock: 60,
      categoryId: createdCategories[5].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1616763355548-1b606f439f86?w=800',
    },

    // TECLADOS
    {
      name: 'Keychron Q6 Pro',
      slug: 'keychron-q6-pro',
      description: 'Teclado mecânico full-size customizável, hot-swappable, RGB, alumínio CNC, switches Gateron Pro.',
      price: 1299.99,
      stock: 50,
      categoryId: createdCategories[6].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800',
    },
    {
      name: 'Logitech MX Keys',
      slug: 'logitech-mx-keys',
      description: 'Teclado wireless premium para produtividade, teclas iluminadas, multi-device, bateria recarregável.',
      price: 799.99,
      stock: 70,
      categoryId: createdCategories[6].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=800',
    },
    {
      name: 'Razer BlackWidow V4 Pro',
      slug: 'razer-blackwidow-v4-pro',
      description: 'Teclado mecânico gamer com switches Green, RGB Chroma, controle de mídia, apoio de pulso magnético.',
      price: 1499.99,
      stock: 40,
      categoryId: createdCategories[6].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=800',
    },

    // MOUSES
    {
      name: 'Logitech MX Master 3S',
      slug: 'logitech-mx-master-3s',
      description: 'Mouse ergonômico premium com sensor 8K DPI, scroll MagSpeed, 8 botões programáveis, multi-device.',
      price: 699.99,
      stock: 80,
      categoryId: createdCategories[7].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=800',
    },
    {
      name: 'Razer Viper V3 Pro',
      slug: 'razer-viper-v3-pro',
      description: 'Mouse gamer wireless ultra-leve (54g), sensor Focus Pro 30K, switches ópticas Gen-3, bateria de 90 horas.',
      price: 1199.99,
      stock: 60,
      categoryId: createdCategories[7].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800',
    },
    {
      name: 'Logitech G Pro X Superlight 2',
      slug: 'logitech-g-pro-x-superlight-2',
      description: 'Mouse gamer profissional, 60g, sensor HERO 2, switches híbridos, usado por e-sports.',
      price: 999.99,
      stock: 50,
      categoryId: createdCategories[7].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1586920740099-e5e5e9e0c799?w=800',
    },

    // CÂMERAS
    {
      name: 'Sony A7 IV',
      slug: 'sony-a7-iv',
      description: 'Câmera mirrorless full-frame 33MP, vídeo 4K 60fps, estabilização de 5.5 stops, autofoco híbrido.',
      price: 14999.99,
      stock: 15,
      categoryId: createdCategories[8].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800',
    },
    {
      name: 'Canon EOS R6 Mark II',
      slug: 'canon-eos-r6-mark-ii',
      description: 'Mirrorless 24MP, disparo contínuo de 40fps, vídeo 4K 60fps sem crop, Dual Pixel AF II.',
      price: 16999.99,
      stock: 12,
      categoryId: createdCategories[8].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1606980707986-6b0d7a2c6e4e?w=800',
    },
    {
      name: 'GoPro Hero 12 Black',
      slug: 'gopro-hero-12-black',
      description: 'Action cam com vídeo 5.3K 60fps, HDR, estabilização HyperSmooth 6.0, resistente à água.',
      price: 2999.99,
      stock: 40,
      categoryId: createdCategories[8].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
    },

    // CONSOLES
    {
      name: 'PlayStation 5',
      slug: 'playstation-5',
      description: 'Console de nova geração com SSD ultra-rápido, ray tracing, 4K 120fps, controle DualSense com feedback háptico.',
      price: 3999.99,
      stock: 30,
      categoryId: createdCategories[9].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=800',
    },
    {
      name: 'Xbox Series X',
      slug: 'xbox-series-x',
      description: 'Console mais poderoso da Microsoft, 12 teraflops, 4K nativo, ray tracing, Quick Resume, Game Pass.',
      price: 3799.99,
      stock: 35,
      categoryId: createdCategories[9].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1621259182978-fbf93132d53d?w=800',
    },
    {
      name: 'Nintendo Switch OLED',
      slug: 'nintendo-switch-oled',
      description: 'Console híbrido com tela OLED de 7 polegadas, áudio aprimorado, 64GB de armazenamento, dock com LAN.',
      price: 2499.99,
      stock: 50,
      categoryId: createdCategories[9].id,
      isFeatured: true,
      image: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=800',
    },

    // ACESSÓRIOS
    {
      name: 'Anker PowerCore 20000mAh',
      slug: 'anker-powercore-20000mah',
      description: 'Power bank de alta capacidade com carregamento rápido, 2 portas USB, compatível com todos dispositivos.',
      price: 299.99,
      stock: 150,
      categoryId: createdCategories[10].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800',
    },
    {
      name: 'SanDisk Extreme Pro 1TB',
      slug: 'sandisk-extreme-pro-1tb',
      description: 'SSD portátil com velocidade de até 2000MB/s, resistente a quedas, água e poeira, USB-C.',
      price: 899.99,
      stock: 100,
      categoryId: createdCategories[10].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=800',
    },
    {
      name: 'Elgato Stream Deck',
      slug: 'elgato-stream-deck',
      description: 'Controlador com 15 teclas LCD personalizáveis para streamers, criadores de conteúdo e produtividade.',
      price: 1299.99,
      stock: 40,
      categoryId: createdCategories[10].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800',
    },
    {
      name: 'Webcam Logitech Brio 4K',
      slug: 'webcam-logitech-brio-4k',
      description: 'Webcam profissional 4K Ultra HD, HDR, autofoco, correção de iluminação, ideal para streaming e videoconferências.',
      price: 1099.99,
      stock: 60,
      categoryId: createdCategories[10].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1585792180666-f7347c490ee2?w=800',
    },
    {
      name: 'Blue Yeti X',
      slug: 'blue-yeti-x',
      description: 'Microfone condensador USB profissional com 4 padrões polares, medidor LED, controle de ganho.',
      price: 1499.99,
      stock: 45,
      categoryId: createdCategories[10].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800',
    },
    {
      name: 'Suporte Ergonômico para Notebook',
      slug: 'suporte-ergonomico-notebook',
      description: 'Suporte ajustável em alumínio, melhora postura, ventilação, compatível com notebooks de 10-17 polegadas.',
      price: 199.99,
      stock: 200,
      categoryId: createdCategories[10].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800',
    },
    {
      name: 'Hub USB-C 7 em 1',
      slug: 'hub-usb-c-7-em-1',
      description: 'Hub com HDMI 4K, 3x USB 3.0, USB-C PD, leitor SD/microSD, ideal para MacBook e notebooks modernos.',
      price: 249.99,
      stock: 180,
      categoryId: createdCategories[10].id,
      isFeatured: false,
      image: 'https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800',
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: product,
    });
  }

  console.log('✅ 50+ Produtos criados');

  // ============================================
  // CUPONS
  // ============================================

  const coupons = [
    {
      code: 'BEMVINDO10',
      description: 'Desconto de 10% para novos clientes',
      discountType: 'PERCENTAGE' as const,
      discountValue: 10,
      minPurchase: 500,
      isActive: true,
      expiresAt: new Date('2025-12-31'),
    },
    {
      code: 'FRETEGRATIS',
      description: 'Frete grátis em compras acima de R$ 299',
      discountType: 'FIXED' as const,
      discountValue: 50,
      minPurchase: 299,
      isActive: true,
    },
    {
      code: 'BLACKFRIDAY50',
      description: 'Black Friday - 50% OFF',
      discountType: 'PERCENTAGE' as const,
      discountValue: 50,
      maxDiscount: 1000,
      usageLimit: 100,
      isActive: false,
      startsAt: new Date('2025-11-29'),
      expiresAt: new Date('2025-12-02'),
    },
  ];

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {},
      create: coupon,
    });
  }

  console.log('✅ Cupons criados');

  console.log('🎉 Seed concluído com sucesso!');
  console.log('\n📧 Credenciais de acesso:');
  console.log('Admin: admin@techmart.com / admin123');
  console.log('User: user@techmart.com / user123');
  console.log('\n🎁 Cupons disponíveis:');
  console.log('- BEMVINDO10 (10% de desconto)');
  console.log('- FRETEGRATIS (Frete grátis acima de R$ 299)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
