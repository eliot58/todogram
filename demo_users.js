const { PrismaClient } = require('./generated/prisma');
const fs = require('fs');

const prisma = new PrismaClient();

function generateUsers(count = 200) {
  const users = [];
  for (let i = 1; i <= count; i++) {
    users.push({
      username: `user_${i}`,
      fullName: `Test User${i}`,
      phone: `+7901234${String(i).padStart(4, '0')}`,
      email: `user${i}@gmail.com`,
      passwordHash: "$2b$10$y.UmNsPavLug0hq9Nkq/z.DDgiN6U5HnaWhHg1CFx3RUkLDlpiu3K",
      bio: i % 3 === 0 ? `Тестовое био пользователя ${i}` : null,
      avatarUrl: null,
      isVerify: true,
    });
  }
  return users;
}

async function importItems() {
  try {
    const data = generateUsers(200);

    await prisma.user.createMany({
      data,
      skipDuplicates: true,
    });

    console.log('✅ 200 пользователей успешно импортированы!');
  } catch (error) {
    console.error('❌ Ошибка при импорте данных:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importItems();
