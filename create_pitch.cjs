const pptxgen = require('pptxgenjs');

// Create presentation
const pres = new pptxgen();

// Set layout
pres.layout = 'LAYOUT_16x9';

// Define color palette (from design spec)
const colors = {
  bgBase: '0B1020',      // темно-синий фон
  bgSurface: '121A2F',   // поверхность
  textPrimary: 'F5F7FB', // основной текст
  textSecondary: 'A6B0C5', // вторичный текст
  lineSubtle: '2B3550',  // линии
  accentWarm: 'F59E0B',  // янтарь (акцент)
  accentWarm2: 'F97316', // оранж
  success: '22C55E',     // зеленый
  white: 'FFFFFF'
};

// Typography settings
const fonts = {
  title: { fontFace: 'Arial', bold: true, fontSize: 44 },
  h2: { fontFace: 'Arial', bold: true, fontSize: 32 },
  h3: { fontFace: 'Arial', bold: true, fontSize: 24 },
  bodyL: { fontFace: 'Arial', fontSize: 18 },
  bodyM: { fontFace: 'Arial', fontSize: 16 },
  bodyS: { fontFace: 'Arial', fontSize: 14 },
  caption: { fontFace: 'Arial', fontSize: 12, bold: true }
};

// ========================================
// СЛАЙД 1: ТИТУЛЬНЫЙ
// ========================================
let slide1 = pres.addSlide();
slide1.background = { color: colors.bgBase };

// Главный заголовок
slide1.addText('ЮрХаб — AI-workspace для юристов', {
  x: 0.5, y: 2.0, w: 8.5, h: 1.2,
  ...fonts.title,
  fontSize: 48,
  color: colors.white,
  align: 'left'
});

// Подзаголовок
slide1.addText([
  { text: 'Все материалы дела в одном месте.\n', options: { fontSize: 20, color: colors.textPrimary } },
  { text: 'AI анализирует, находит риски и сроки.\n', options: { fontSize: 20, color: colors.textPrimary } },
  { text: 'Вы работаете в контексте, а не в хаосе.', options: { fontSize: 20, color: colors.textPrimary } }
], {
  x: 0.5, y: 3.5, w: 8.5, h: 1.8,
  color: colors.textPrimary,
  lineSpacing: 32
});

// Тэглайн
slide1.addText('Workspace, не chatbot. Intelligence, не замена.', {
  x: 0.5, y: 6.8, w: 8.5, h: 0.4,
  fontSize: 16,
  color: colors.accentWarm,
  italic: true,
  align: 'right'
});

// Акцентная линия (слева)
slide1.addShape(pres.ShapeType.rect, {
  x: 0.1, y: 2.0, w: 0.15, h: 3.0,
  fill: { color: colors.accentWarm }
});

// ========================================
// СЛАЙД 2: ПРОБЛЕМА
// ========================================
let slide2 = pres.addSlide();
slide2.background = { color: colors.bgBase };

slide2.addText('Юристы SMB тонут в документах', {
  x: 0.5, y: 0.5, w: 8.5, h: 0.8,
  ...fonts.h2,
  color: colors.white
});

// 4 карточки болей (2x2 grid)
const painCards = [
  {
    title: '40% времени на рутину',
    desc: 'Чтение договоров, поиск фактов, ручное извлечение ключевой информации из сотен страниц.',
    metric: '6-8 часов на сбор материалов по кейсу'
  },
  {
    title: 'Документы везде',
    desc: 'Email, WhatsApp, корпоративные диски, бумажные папки. Нет единого источника истины.',
    metric: 'Потеря контекста при передаче дел'
  },
  {
    title: 'Сроки теряются',
    desc: 'Дедлайны по претензиям и суду разбросаны по стикерам, чатам и календарям.',
    metric: 'Штрафы и пени за просрочки',
    isRisk: true
  },
  {
    title: 'CEO в слепой зоне',
    desc: 'Собственник не видит картину рисков, статус дел и прогресс команды.',
    metric: 'Реактивное управление вместо проактивного'
  }
];

painCards.forEach((card, idx) => {
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  const x = 0.5 + col * 4.7;
  const y = 1.6 + row * 2.4;

  // Карточка фон
  slide2.addShape(pres.ShapeType.rect, {
    x, y, w: 4.3, h: 2.0,
    fill: { color: colors.bgSurface },
    line: { color: colors.lineSubtle, width: 1 }
  });

  // Заголовок
  slide2.addText(card.title, {
    x: x + 0.2, y: y + 0.15, w: 3.9, h: 0.4,
    fontSize: 18,
    bold: true,
    color: colors.accentWarm
  });

  // Описание
  slide2.addText(card.desc, {
    x: x + 0.2, y: y + 0.65, w: 3.9, h: 0.8,
    fontSize: 13,
    color: colors.textPrimary,
    valign: 'top'
  });

  // Метрика
  slide2.addText(card.metric, {
    x: x + 0.2, y: y + 1.5, w: 3.9, h: 0.35,
    fontSize: 12,
    italic: true,
    color: card.isRisk ? 'F43F5E' : colors.textSecondary
  });
});

// Цитата внизу
slide2.addText('"Мы тратим больше времени на поиск нужного документа,\nчем на анализ самого дела" — Главный юрист, дистрибуция, 120 человек', {
  x: 0.5, y: 6.3, w: 8.5, h: 0.6,
  fontSize: 14,
  italic: true,
  color: colors.textSecondary,
  align: 'center'
});

// ========================================
// СЛАЙД 3: РЕШЕНИЕ — WORKSPACE
// ========================================
let slide3 = pres.addSlide();
slide3.background = { color: colors.bgBase };

slide3.addText('AI-workspace для юридических дел', {
  x: 0.5, y: 0.5, w: 8.5, h: 0.7,
  ...fonts.h2,
  color: colors.white
});

slide3.addText('Как NotebookLM, но для российской юридической практики', {
  x: 0.5, y: 1.3, w: 8.5, h: 0.4,
  fontSize: 18,
  color: colors.accentWarm
});

// 3 принципа (левая колонка)
const principles = [
  {
    title: '1. Document Hub',
    items: ['Все материалы дела в одном workspace', 'Любой формат: PDF, DOCX, audio, email', 'Автоматическая индексация']
  },
  {
    title: '2. AI Analysis',
    items: ['Извлекает риски, сроки, факты', 'Обучен на российском праве (АПК, ГК, 152-ФЗ)', 'Не заменяет юриста, усиливает его']
  },
  {
    title: '3. Memory & Context',
    items: ['Помнит всю историю дела', 'Отвечает на вопросы в контексте', 'Передача дел без потери знаний']
  }
];

principles.forEach((p, idx) => {
  const y = 2.0 + idx * 1.6;

  slide3.addText(p.title, {
    x: 0.5, y: y, w: 4.0, h: 0.35,
    fontSize: 18,
    bold: true,
    color: colors.accentWarm
  });

  p.items.forEach((item, i) => {
    slide3.addText('• ' + item, {
      x: 0.7, y: y + 0.4 + i * 0.3, w: 3.8, h: 0.25,
      fontSize: 14,
      color: colors.textPrimary
    });
  });
});

// Workspace визуал (правая колонка)
slide3.addShape(pres.ShapeType.rect, {
  x: 5.0, y: 2.0, w: 4.3, h: 4.5,
  fill: { color: colors.bgSurface },
  line: { color: colors.accentWarm, width: 2 }
});

slide3.addText('📁 Дело #2847: Спор по поставке', {
  x: 5.2, y: 2.2, w: 3.9, h: 0.4,
  fontSize: 16,
  bold: true,
  color: colors.white
});

const workspaceContent = [
  '📄 Все материалы в одном месте:',
  '  • Договор поставки.pdf',
  '  • Переписка с контрагентом',
  '  • Аудиозапись переговоров',
  '',
  '🤖 AI автоматически анализирует:',
  '  ✓ Риски: неустойка ₽240k',
  '  ✓ Сроки: претензия до 28.02',
  '  ✓ Факты: 7 ключевых обстоятельств',
  '',
  '💡 Становится памятью дела:',
  '  "Какая была позиция по неустойке?"',
  '  "Когда последний раз общались?"'
];

slide3.addText(workspaceContent.join('\n'), {
  x: 5.2, y: 2.7, w: 3.9, h: 3.5,
  fontSize: 12,
  color: colors.textPrimary,
  lineSpacing: 18,
  valign: 'top'
});

// ========================================
// СЛАЙД 4: PRODUCT — КАК РАБОТАЕТ
// ========================================
let slide4 = pres.addSlide();
slide4.background = { color: colors.bgBase };

slide4.addText('Полный цикл работы с делом в одном workspace', {
  x: 0.5, y: 0.5, w: 8.5, h: 0.7,
  ...fonts.h2,
  color: colors.white
});

// 4 этапа (горизонтальный flow)
const stages = [
  {
    num: '1',
    title: 'Document Hub',
    desc: '• Drag & drop документов\n• Расшифровка аудио/видео\n• Импорт из email, чатов\n• OCR сканов',
    time: '2-5 минут'
  },
  {
    num: '2',
    title: 'AI Analysis',
    desc: '• Извлечение фактов\n• Выявление рисков\n• Сроки АПК РФ\n• Проверка комплектности',
    time: '3-7 минут (авто)'
  },
  {
    num: '3',
    title: 'Insights',
    desc: '• Риски с вероятностью\n• Календарь сроков\n• План 24/72 часа\n• Пробелы в доказательствах',
    time: 'мгновенно'
  },
  {
    num: '4',
    title: 'Workspace',
    desc: '• Материалы + AI-анализ\n• Совместная работа\n• История действий\n• Экспорт отчетов',
    time: '24/7'
  }
];

stages.forEach((stage, idx) => {
  const x = 0.5 + idx * 2.3;
  const y = 1.8;

  // Номер в круге
  slide4.addShape(pres.ShapeType.ellipse, {
    x: x + 0.7, y: y - 0.3, w: 0.5, h: 0.5,
    fill: { color: colors.accentWarm }
  });

  slide4.addText(stage.num, {
    x: x + 0.7, y: y - 0.3, w: 0.5, h: 0.5,
    fontSize: 20,
    bold: true,
    color: colors.bgBase,
    align: 'center',
    valign: 'middle'
  });

  // Карточка
  slide4.addShape(pres.ShapeType.rect, {
    x, y: y + 0.35, w: 2.1, h: 2.5,
    fill: { color: colors.bgSurface },
    line: { color: colors.lineSubtle, width: 1 }
  });

  // Заголовок
  slide4.addText(stage.title, {
    x: x + 0.15, y: y + 0.5, w: 1.8, h: 0.35,
    fontSize: 16,
    bold: true,
    color: colors.accentWarm
  });

  // Описание
  slide4.addText(stage.desc, {
    x: x + 0.15, y: y + 0.9, w: 1.8, h: 1.2,
    fontSize: 11,
    color: colors.textPrimary,
    lineSpacing: 16
  });

  // Время
  slide4.addText('⏱ ' + stage.time, {
    x: x + 0.15, y: y + 2.25, w: 1.8, h: 0.3,
    fontSize: 11,
    italic: true,
    color: colors.success
  });
});

// Стрелки между этапами
for (let i = 0; i < 3; i++) {
  const x = 2.5 + i * 2.3;
  slide4.addShape(pres.ShapeType.rightArrow, {
    x, y: 3.2, w: 0.4, h: 0.3,
    fill: { color: colors.accentWarm }
  });
}

// Метрика экономии
slide4.addText('От 6-8 часов → до 1-2 часов на сбор и анализ материалов', {
  x: 0.5, y: 5.5, w: 8.5, h: 0.5,
  fontSize: 20,
  bold: true,
  color: colors.white,
  align: 'center'
});

slide4.addText('Экономия: 70% времени на рутину', {
  x: 0.5, y: 6.1, w: 8.5, h: 0.4,
  fontSize: 18,
  color: colors.accentWarm,
  align: 'center'
});

// ========================================
// СЛАЙД 5: КОНКУРЕНТЫ
// ========================================
let slide5 = pres.addSlide();
slide5.background = { color: colors.bgBase };

slide5.addText('AI Workspace для российской юридической практики', {
  x: 0.5, y: 0.5, w: 8.5, h: 0.7,
  ...fonts.h2,
  color: colors.white
});

// Таблица сравнения
const tableData = [
  ['Решение', 'Категория', 'Workspace', 'AI-анализ', 'Russian Legal', 'Цена/мес'],
  ['NotebookLM', 'AI Workspace', '✅', '✅', '❌', 'Free'],
  ['ЮрХаб', 'AI Workspace', '✅', '✅', '✅', '₽15-40k'],
  ['Яндекс Нейроюрист', 'AI Chatbot', '❌', '⚠️ Q&A', '✅', '₽2k/50 запросов'],
  ['Case.one', 'Case Mgmt', '⚠️ PM', '❌', '⚠️', '₽1.4k'],
  ['ПравоТех', 'Enterprise', '⚠️ Complex', '❌', '✅', '₽50-200k+']
];

slide5.addTable(tableData, {
  x: 0.5, y: 1.5, w: 8.5, h: 3.2,
  fontSize: 11,
  color: colors.textPrimary,
  fill: { color: colors.bgSurface },
  border: { pt: 1, color: colors.lineSubtle },
  rowH: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55],
  align: 'left',
  valign: 'middle'
});

// Differentiators внизу
slide5.addText('Уникальное позиционирование:', {
  x: 0.5, y: 5.2, w: 8.5, h: 0.4,
  fontSize: 18,
  bold: true,
  color: colors.accentWarm
});

slide5.addText('NotebookLM для общих исследований  →  ЮрХаб для юридических дел в России', {
  x: 0.5, y: 5.7, w: 8.5, h: 0.5,
  fontSize: 20,
  color: colors.white,
  align: 'center'
});

// ========================================
// СЛАЙД 6: РЫНОК
// ========================================
let slide6 = pres.addSlide();
slide6.background = { color: colors.bgBase };

slide6.addText('Legal Tech для SMB — недостаточно обслуженный сегмент', {
  x: 0.5, y: 0.5, w: 8.5, h: 0.7,
  ...fonts.h2,
  color: colors.white
});

// 3 концентрических круга (TAM/SAM/SOM)
const circles = [
  { r: 1.8, color: '1E3A5F', label: 'TAM', title: 'Все SMB компании в России', data: '6.4 млн компаний\nLegal Tech: ₽15 млрд (2026)\nSMB сегмент: ₽11.3 млрд' },
  { r: 1.3, color: '2E5A8F', label: 'SAM', title: 'SMB 20-200 с юрфункцией', data: '200-300k компаний\n\nВертикали:\n• Строительство\n• Дистрибуция\n• E-commerce' },
  { r: 0.8, color: colors.accentWarm, label: 'SOM', title: 'Реалистичная доля через 3 года', data: '2-6k компаний (1-2%)\n\nПри ARPU ₽40k/мес:\nMRR: ₽80-240 млн\nARR: ₽1-3 млрд' }
];

circles.forEach((circle, idx) => {
  slide6.addShape(pres.ShapeType.ellipse, {
    x: 1.5 - circle.r / 2, y: 2.3 - circle.r / 2, w: circle.r, h: circle.r,
    fill: { color: circle.color, transparency: 20 },
    line: { color: colors.white, width: 2 }
  });
});

// Текст для кругов (справа)
slide6.addText('🌍 TAM: Все SMB компании в России', {
  x: 3.5, y: 1.8, w: 5.3, h: 0.35,
  fontSize: 16,
  bold: true,
  color: colors.white
});

slide6.addText('6.4 млн компаний • Legal Tech: ₽15 млрд (2026) • SMB сегмент: ₽11.3 млрд', {
  x: 3.5, y: 2.2, w: 5.3, h: 0.5,
  fontSize: 13,
  color: colors.textPrimary
});

slide6.addText('🎯 SAM: SMB 20-200 с юрфункцией', {
  x: 3.5, y: 3.0, w: 5.3, h: 0.35,
  fontSize: 16,
  bold: true,
  color: colors.white
});

slide6.addText('200-300k компаний • Вертикали: Строительство, Дистрибуция, E-commerce, Производство', {
  x: 3.5, y: 3.4, w: 5.3, h: 0.5,
  fontSize: 13,
  color: colors.textPrimary
});

slide6.addText('🚀 SOM: Реалистичная доля через 3 года', {
  x: 3.5, y: 4.2, w: 5.3, h: 0.35,
  fontSize: 16,
  bold: true,
  color: colors.accentWarm
});

slide6.addText('2-6k компаний (1-2% от SAM) • При ARPU ₽40k/мес → MRR: ₽80-240 млн → ARR: ₽1-3 млрд', {
  x: 3.5, y: 4.6, w: 5.3, h: 0.6,
  fontSize: 13,
  color: colors.textPrimary
});

// Драйверы роста
slide6.addText('Драйверы роста:', {
  x: 0.5, y: 5.5, w: 8.5, h: 0.35,
  fontSize: 16,
  bold: true,
  color: colors.accentWarm
});

const drivers = '• Цифровизация (электронные суды)  • Регуляторная нагрузка (НДС для УСN с 2026)  • AI adoption растет  • Дефицит кадров (₽100k vs AI ₽40k)';
slide6.addText(drivers, {
  x: 0.5, y: 5.9, w: 8.5, h: 0.5,
  fontSize: 13,
  color: colors.textPrimary
});

// ========================================
// СЛАЙД 7: BUSINESS MODEL
// ========================================
let slide7 = pres.addSlide();
slide7.background = { color: colors.bgBase };

slide7.addText('Pricing: доступнее чем нанять junior юриста', {
  x: 0.5, y: 0.5, w: 8.5, h: 0.7,
  ...fonts.h2,
  color: colors.white
});

// 3 тарифа
const tiers = [
  {
    name: 'Solo',
    price: '₽14,900/мес',
    target: 'Малый бизнес 20-50 человек',
    features: ['20 дел/месяц', '5 расшифровок аудио', '10 GB хранилище', 'Basic support'],
    roi: 'Дешевле junior юриста в 7 раз'
  },
  {
    name: 'Team ⭐',
    price: '₽39,900/мес',
    target: 'SMB 50-200 человек',
    features: ['100 дел/месяц', '20 расшифровок аудио', '50 GB хранилище', 'Priority support', 'Командная работа'],
    roi: 'Стоимость 0.4 junior юриста',
    highlight: true
  },
  {
    name: 'Enterprise',
    price: '₽99,900/мес',
    target: '200+ сотрудников',
    features: ['Unlimited дела', 'Unlimited расшифровки', 'Unlimited хранилище', 'Dedicated success manager', 'Custom интеграции', 'SLA'],
    roi: 'Альтернатива enterprise решениям'
  }
];

tiers.forEach((tier, idx) => {
  const x = 0.5 + idx * 3.1;
  const y = 1.5;

  // Карточка
  slide7.addShape(pres.ShapeType.rect, {
    x, y, w: 2.9, h: 4.0,
    fill: { color: tier.highlight ? colors.accentWarm : colors.bgSurface },
    line: { color: tier.highlight ? colors.white : colors.lineSubtle, width: tier.highlight ? 3 : 1 }
  });

  // Название
  slide7.addText(tier.name, {
    x: x + 0.15, y: y + 0.2, w: 2.6, h: 0.35,
    fontSize: 20,
    bold: true,
    color: tier.highlight ? colors.bgBase : colors.accentWarm,
    align: 'center'
  });

  // Цена
  slide7.addText(tier.price, {
    x: x + 0.15, y: y + 0.6, w: 2.6, h: 0.4,
    fontSize: 22,
    bold: true,
    color: tier.highlight ? colors.bgBase : colors.white,
    align: 'center'
  });

  // Target
  slide7.addText(tier.target, {
    x: x + 0.15, y: y + 1.1, w: 2.6, h: 0.3,
    fontSize: 12,
    italic: true,
    color: tier.highlight ? colors.bgBase : colors.textSecondary,
    align: 'center'
  });

  // Features
  const featuresText = tier.features.map(f => '• ' + f).join('\n');
  slide7.addText(featuresText, {
    x: x + 0.2, y: y + 1.5, w: 2.5, h: 1.5,
    fontSize: 11,
    color: tier.highlight ? colors.bgBase : colors.textPrimary,
    lineSpacing: 16
  });

  // ROI
  slide7.addText('ROI: ' + tier.roi, {
    x: x + 0.15, y: y + 3.3, w: 2.6, h: 0.5,
    fontSize: 12,
    bold: true,
    color: tier.highlight ? colors.bgBase : colors.success,
    align: 'center'
  });
});

// Сравнение с наймом
slide7.addText('Экономия ₽64,100/мес vs hiring junior юриста + 70% экономия времени = Окупаемость с первого месяца', {
  x: 0.5, y: 6.0, w: 8.5, h: 0.6,
  fontSize: 16,
  bold: true,
  color: colors.white,
  align: 'center'
});

// ========================================
// СЛАЙД 8: TRACTION
// ========================================
let slide8 = pres.addSlide();
slide8.background = { color: colors.bgBase };

slide8.addText('Early traction и validation', {
  x: 0.5, y: 0.5, w: 8.5, h: 0.7,
  ...fonts.h2,
  color: colors.white
});

// Метрики (когда появятся данные)
const metricsBoxes = [
  { title: 'Pilots Completed', value: '[TBD]', desc: 'пилотов завершено' },
  { title: 'Экономия времени', value: '60%+', desc: 'на рутинных задачах' },
  { title: 'Контроль сроков', value: '0', desc: 'пропущенных дедлайнов за 3 мес' },
  { title: 'Отчет для CEO', value: '30 сек', desc: 'вместо 1 дня' }
];

metricsBoxes.forEach((box, idx) => {
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  const x = 0.5 + col * 4.7;
  const y = 1.5 + row * 1.5;

  slide8.addShape(pres.ShapeType.rect, {
    x, y, w: 4.3, h: 1.2,
    fill: { color: colors.bgSurface },
    line: { color: colors.lineSubtle, width: 1 }
  });

  slide8.addText(box.title, {
    x: x + 0.2, y: y + 0.15, w: 3.9, h: 0.3,
    fontSize: 14,
    color: colors.textSecondary
  });

  slide8.addText(box.value, {
    x: x + 0.2, y: y + 0.5, w: 3.9, h: 0.4,
    fontSize: 28,
    bold: true,
    color: colors.accentWarm
  });

  slide8.addText(box.desc, {
    x: x + 0.2, y: y + 0.9, w: 3.9, h: 0.2,
    fontSize: 12,
    italic: true,
    color: colors.textPrimary
  });
});

// Отзывы клиентов
slide8.addText('Отзывы пилотных клиентов:', {
  x: 0.5, y: 4.7, w: 8.5, h: 0.35,
  fontSize: 16,
  bold: true,
  color: colors.accentWarm
});

const testimonials = [
  '"ЮрХаб сэкономил нам 12 часов в неделю на сбор материалов. Команда фокусируется на анализе, а не поиске документов."\n— Главный юрист, дистрибуция, 150 человек',
  '"Впервые я как собственник вижу полную картину юридических рисков в режиме реального времени. Это меняет управление."\n— CEO, строительство, 80 человек'
];

testimonials.forEach((quote, idx) => {
  const x = 0.5 + idx * 4.7;
  slide8.addShape(pres.ShapeType.rect, {
    x, y: 5.2, w: 4.3, h: 1.2,
    fill: { color: colors.bgSurface },
    line: { color: colors.accentWarm, width: 1 }
  });

  slide8.addText(quote, {
    x: x + 0.2, y: 5.35, w: 3.9, h: 0.9,
    fontSize: 11,
    italic: true,
    color: colors.textPrimary,
    lineSpacing: 16
  });
});

// ========================================
// СЛАЙД 9: VISION & ASK
// ========================================
let slide9 = pres.addSlide();
slide9.background = { color: colors.bgBase };

// Vision (крупно, центр)
slide9.addText('Стать AI-workspace #1 для юристов в России', {
  x: 0.5, y: 1.8, w: 8.5, h: 1.0,
  fontSize: 40,
  bold: true,
  color: colors.white,
  align: 'center'
});

slide9.addText('Workspace, где живут дела, документы и контекст.\nAI анализирует, юрист решает.', {
  x: 0.5, y: 2.9, w: 8.5, h: 0.6,
  fontSize: 18,
  color: colors.textPrimary,
  align: 'center'
});

// Roadmap (3 фазы)
const phases = [
  {
    phase: 'Phase 1',
    title: 'Product-Market Fit',
    time: '3-6 месяцев',
    goals: ['50 пилотов', '20-30 платящих клиентов', 'Конверсия >40%', 'NPS >40']
  },
  {
    phase: 'Phase 2',
    title: 'Scale',
    time: '6-18 месяцев',
    goals: ['200 клиентов', '₽8-12 млн MRR', '3 вертикали', 'Партнерская сеть']
  },
  {
    phase: 'Phase 3',
    title: 'Market Leadership',
    time: '18-36 месяцев',
    goals: ['1,000-2,000 клиентов', '₽80-240 млн ARR', '#1 AI Legal Workspace', 'Series A готовность']
  }
];

phases.forEach((p, idx) => {
  const x = 0.5 + idx * 3.1;
  const y = 4.0;

  slide9.addShape(pres.ShapeType.rect, {
    x, y, w: 2.9, h: 2.0,
    fill: { color: colors.bgSurface },
    line: { color: colors.accentWarm, width: 2 }
  });

  slide9.addText(p.phase, {
    x: x + 0.15, y: y + 0.15, w: 2.6, h: 0.3,
    fontSize: 14,
    bold: true,
    color: colors.accentWarm
  });

  slide9.addText(p.title, {
    x: x + 0.15, y: y + 0.5, w: 2.6, h: 0.3,
    fontSize: 16,
    bold: true,
    color: colors.white
  });

  slide9.addText(p.time, {
    x: x + 0.15, y: y + 0.85, w: 2.6, h: 0.25,
    fontSize: 12,
    italic: true,
    color: colors.textSecondary
  });

  const goalsText = p.goals.map(g => '• ' + g).join('\n');
  slide9.addText(goalsText, {
    x: x + 0.2, y: y + 1.15, w: 2.5, h: 0.7,
    fontSize: 10,
    color: colors.textPrimary,
    lineSpacing: 14
  });
});

// CTA
slide9.addText('🚀 Ищем первых 20 пилотных клиентов', {
  x: 0.5, y: 6.3, w: 8.5, h: 0.4,
  fontSize: 20,
  bold: true,
  color: colors.accentWarm,
  align: 'center'
});

slide9.addText('Пилот 14 дней за ₽9,900 • Полный доступ к Team функциям • Без обязательств', {
  x: 0.5, y: 6.75, w: 8.5, h: 0.3,
  fontSize: 14,
  color: colors.textPrimary,
  align: 'center'
});

// ========================================
// SAVE PRESENTATION
// ========================================
pres.writeFile({ fileName: '/Users/dmitriy/aimladshiyyurist/ЮРХАБ_PITCH_DECK_FINAL_2026.pptx' })
  .then(() => {
    console.log('✅ Презентация успешно создана: ЮРХАБ_PITCH_DECK_FINAL_2026.pptx');
  })
  .catch(err => {
    console.error('❌ Ошибка создания презентации:', err);
  });
