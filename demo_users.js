const { PrismaClient } = require('./generated/prisma');
const fs = require('fs');

const prisma = new PrismaClient();

async function importItems() {
  try {
    const data = JSON.parse(fs.readFileSync('./users.json', 'utf8'));

    await prisma.user.createMany({
        data,
        skipDuplicates: true
    });

    console.log('Данные успешно импортированы!');
  } catch (error) {
    console.error('Ошибка при импорте данных:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importItems();