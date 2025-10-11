const { PrismaClient } = require('./generated/prisma');
const fs = require('fs');

const prisma = new PrismaClient();

// --- Конфиг S3 и постов ---
const IMAGES_BASE = 'https://s3.twcstorage.ru/db1450dc-47945e70-1d58-4112-84d9-6c2f05b41ca2/demo/images';
const VIDEOS_BASE = 'https://s3.twcstorage.ru/db1450dc-47945e70-1d58-4112-84d9-6c2f05b41ca2/demo/videos';
const MAX_INDEX = 19;          // картинки/видео: 1..19
const POSTS_PER_KIND = 10;      // 5 обычных + 5 рилсов

// --- Короткие/длинные подписи ---
const SHORT_CAPTIONS = [
  'Хорошего дня всем!',
  'Проверяю ленту :)',
  'Люблю этот вид',
  'Снято на телефон',
  'Новая неделя — новые цели',
  'Пишите в комменты!',
  'Work hard, dream big',
  'Сегодня без слов',
  'Лайк — лучшее спасибо',
  'Ещё один кадр в копилку'
];

const LONG_CAPTION_PARTS = {
  openers: [
    'Сегодня был идеальный день для небольшого приключения и новых кадров.',
    'Иногда достаточно одного кадра, чтобы вспомнить целую историю.',
    'Поймал момент, который хотелось сохранить не только в памяти, но и здесь.',
    'Снимок без фильтров и лишнего шума — просто атмосфера и настроение.',
    'Долго думал, выкладывать ли это, но пусть остаётся как напоминание.'
  ],
  bodies: [
    'Шум города остался где-то позади, а здесь только тихий ветер и мысли, которые наконец-то складываются в порядок.',
    'Цвета на фото почти как вживую: мягкий свет, немного теней и ощущение движения.',
    'Хочется чаще замечать такие детали и делиться ими — это заряжает и вдохновляет.',
    'Никакого сценария: один дубль, одна попытка и честная эмоция.',
    'Вроде бы обычный кадр, но для меня он про баланс и спокойствие.'
  ],
  closers: [
    'Спасибо, что смотрите и поддерживаете — это важно.',
    'Как вам настроение снимка? Делитесь мыслями.',
    'Пусть у каждого сегодня будет минутка тишины.',
    'Продолжение следует — есть ещё несколько идей.',
    'Если откликнулось — сохраняйте, чтобы вернуться позже.'
  ],
  hashtags: [
    '#настроение', '#вдохновение', '#todogram', '#life', '#reels',
    '#утро', '#вечер', '#безфильтров', '#снятонателефон', '#день'
  ]
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function buildLongCaption() {
  const parts = [pick(LONG_CAPTION_PARTS.openers), pick(LONG_CAPTION_PARTS.bodies), pick(LONG_CAPTION_PARTS.closers)];
  const tags = Array.from({ length: randInt(2, 4) }, () => pick(LONG_CAPTION_PARTS.hashtags));
  const text = parts.join(' ') + '\n\n' + tags.join(' ');
  return text.slice(0, 900); // страховка по длине
}

// 60% постов с подписью; среди них ~35% — длинные
function maybeCaption() {
  if (Math.random() < 0.60) {
    const isLong = Math.random() < 0.35;
    return isLong ? buildLongCaption() : pick(SHORT_CAPTIONS);
  }
  return null; // без подписи
}

// Выбираем K уникальных индексов из диапазона [1..MAX_INDEX]
function uniqueIndices(k, maxIndex) {
  const set = new Set();
  while (set.size < k) set.add(randInt(1, maxIndex));
  return Array.from(set);
}

// --- Создание постов ---
async function createImagePost(userId) {
  // «Иногда несколько картинок»: ~65% постов будут с 1 фото, иначе 2..4 фото
  const numImages = Math.random() < 0.65 ? 1 : randInt(2, 4);
  const idxs = uniqueIndices(numImages, MAX_INDEX);

  const imagesCreate = idxs.map((i, pos) => ({
    url: `${IMAGES_BASE}/${i}.jpg`,
    position: pos // ВАЖНО: уникальность (postId, position)
  }));

  const caption = maybeCaption();

  const data = {
    userId,
    isReels: false,
    images: { create: imagesCreate }
  };
  if (caption !== null) data.caption = caption;

  return prisma.post.create({ data });
}

async function createReelPost(userId) {
  const idx = randInt(1, MAX_INDEX);
  const videoUrl = `${VIDEOS_BASE}/${idx}.mp4`;
  const thumbnail =`${IMAGES_BASE}/${randInt(1, 19)}.jpg`;
  const caption = maybeCaption();

  const data = { userId, isReels: true, videoUrl, thumbnail };
  if (caption !== null) data.caption = caption;

  return prisma.post.create({ data });
}

// --- Основной импорт ---
async function importItems() {
  try {
    let totalCreated = 0;

    for (let j = 1; j <= 200; j++) {
      const dbUser = await prisma.user.findUnique({
        where: { id: j },
        select: { id: true, email: true }
      });
      if (!dbUser) {
        console.warn(`Пользователь не найден, пропускаю: ${u.email}`);
        continue;
      }
      
      const [imgCount, reelsCount] = await Promise.all([
        prisma.post.count({ where: { userId: dbUser.id, isReels: false } }),
        prisma.post.count({ where: { userId: dbUser.id, isReels: true } })
      ]);

      const needImages = Math.max(0, POSTS_PER_KIND - imgCount);
      const needReels  = Math.max(0, POSTS_PER_KIND - reelsCount);

      if (needImages === 0 && needReels === 0) {
        console.log(`У ${dbUser.email} уже есть 5 обычных и 5 рилсов — пропускаю`);
        continue;
      }

      for (let i = 0; i < needImages; i++) {
        await createImagePost(dbUser.id);
        totalCreated++;
      }
      for (let i = 0; i < needReels; i++) {
        await createReelPost(dbUser.id);
        totalCreated++;
      }

      console.log(`Создано для ${dbUser.email}: +${needImages} обычных, +${needReels} рилсов`);
    }

    console.log(`Готово! Всего создано постов: ${totalCreated}`);
    console.log('Данные успешно импортированы!');
  } catch (error) {
    console.error('Ошибка при импорте данных:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importItems();
