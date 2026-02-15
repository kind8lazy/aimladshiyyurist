import Foundation
import AppKit

let outputPath = "/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/docs/PITCH_DECK_9_SLIDES_RU_DESIGNED_V2.pdf"
let pageWidth: CGFloat = 1920
let pageHeight: CGFloat = 1080

func c(_ hex: Int, _ alpha: CGFloat = 1.0) -> NSColor {
    NSColor(
        calibratedRed: CGFloat((hex >> 16) & 0xFF) / 255.0,
        green: CGFloat((hex >> 8) & 0xFF) / 255.0,
        blue: CGFloat(hex & 0xFF) / 255.0,
        alpha: alpha
    )
}

func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont {
    NSFont.systemFont(ofSize: size, weight: weight)
}

func drawText(_ text: String, rect: NSRect, size: CGFloat, weight: NSFont.Weight = .regular, color: NSColor = .white, align: NSTextAlignment = .left) {
    let style = NSMutableParagraphStyle()
    style.alignment = align
    style.lineBreakMode = .byWordWrapping
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font(size, weight),
        .foregroundColor: color,
        .paragraphStyle: style
    ]
    (text as NSString).draw(in: rect, withAttributes: attrs)
}

func roundedRect(_ rect: NSRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, line: CGFloat = 1) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    if let stroke {
        stroke.setStroke()
        path.lineWidth = line
        path.stroke()
    }
}

func drawBackground() {
    let grad = NSGradient(colors: [c(0x0B1020), c(0x131E3D)])!
    grad.draw(in: NSRect(x: 0, y: 0, width: pageWidth, height: pageHeight), angle: 140)

    roundedRect(NSRect(x: pageWidth - 520, y: -120, width: 700, height: 700), radius: 350, fill: c(0xF59E0B, 0.10))
    roundedRect(NSRect(x: pageWidth - 780, y: 640, width: 500, height: 500), radius: 250, fill: c(0xF97316, 0.10))
}

func sectionTitle(_ title: String, _ subtitle: String? = nil) {
    drawText(title, rect: NSRect(x: 110, y: 80, width: 1280, height: 180), size: 64, weight: .bold, color: c(0xF5F7FB))
    if let subtitle {
        drawText(subtitle, rect: NSRect(x: 110, y: 240, width: 1320, height: 120), size: 30, weight: .medium, color: c(0xA6B0C5))
    }
}

func painCard(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, title: String, body: String, metric: String) {
    roundedRect(NSRect(x: x, y: y, width: w, height: h), radius: 22, fill: c(0x121A2F, 0.95), stroke: c(0x2B3550), line: 2)
    roundedRect(NSRect(x: x + 24, y: y + 24, width: 14, height: 14), radius: 7, fill: c(0xF59E0B))
    drawText(title, rect: NSRect(x: x + 50, y: y + 14, width: w - 70, height: 50), size: 30, weight: .bold)
    drawText(body, rect: NSRect(x: x + 24, y: y + 66, width: w - 48, height: 90), size: 22, weight: .medium, color: c(0xA6B0C5))
    drawText(metric, rect: NSRect(x: x + 24, y: y + h - 70, width: w - 48, height: 45), size: 34, weight: .bold, color: c(0xF59E0B))
}

func featureCard(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, title: String, body: String) {
    roundedRect(NSRect(x: x, y: y, width: w, height: h), radius: 18, fill: c(0x121A2F, 0.95), stroke: c(0x2B3550), line: 2)
    roundedRect(NSRect(x: x + 20, y: y + 18, width: 120, height: 30), radius: 15, fill: c(0xF59E0B, 0.20))
    drawText("МОДУЛЬ", rect: NSRect(x: x + 36, y: y + 22, width: 90, height: 22), size: 14, weight: .bold, color: c(0xF59E0B))
    drawText(title, rect: NSRect(x: x + 20, y: y + 56, width: w - 40, height: 40), size: 28, weight: .bold)
    drawText(body, rect: NSRect(x: x + 20, y: y + 100, width: w - 40, height: h - 120), size: 21, weight: .medium, color: c(0xA6B0C5))
}

func slide1() {
    drawBackground()
    sectionTitle("ЮрОперации ИИ", "Операционная система юрфункции для SMB")
    drawText("Для дистрибуции в Москве: сроки, риски и деньги под управлением в одном контуре", rect: NSRect(x: 110, y: 350, width: 1200, height: 140), size: 34, weight: .medium)

    roundedRect(NSRect(x: 110, y: 500, width: 460, height: 84), radius: 42, fill: c(0xF59E0B))
    drawText("Пилот 14 дней", rect: NSRect(x: 130, y: 520, width: 420, height: 44), size: 34, weight: .bold, color: c(0x121A2F), align: .center)

    roundedRect(NSRect(x: 1110, y: 320, width: 700, height: 560), radius: 30, fill: c(0x121A2F, 0.9), stroke: c(0x2B3550), line: 2)
    drawText("Dashboard", rect: NSRect(x: 1150, y: 370, width: 620, height: 40), size: 24, weight: .semibold, color: c(0xA6B0C5))
    roundedRect(NSRect(x: 1150, y: 430, width: 620, height: 90), radius: 14, fill: c(0x1B2745))
    roundedRect(NSRect(x: 1150, y: 540, width: 300, height: 300), radius: 14, fill: c(0x1B2745))
    roundedRect(NSRect(x: 1470, y: 540, width: 300, height: 300), radius: 14, fill: c(0x1B2745))

    drawText("Дмитрий • @dmitriy • founder@example.com", rect: NSRect(x: 110, y: 980, width: 1100, height: 36), size: 22, weight: .medium, color: c(0xA6B0C5))
}

func slide2() {
    drawBackground()
    sectionTitle("Юридическая рутина съедает маржу", "Собственник платит за хаос процесса, а не за результат")
    painCard(x: 110, y: 320, w: 410, h: 300, title: "Перегруз команды", body: "Ручной сбор материалов вместо подготовки позиции по делу", metric: "до 40% времени")
    painCard(x: 540, y: 320, w: 410, h: 300, title: "Срыв сроков", body: "Претензии и процессуальные дедлайны теряются между чатами", metric: "штрафы и пени")
    painCard(x: 970, y: 320, w: 410, h: 300, title: "Нет прозрачности", body: "Руководитель не видит статус риска до момента эскалации", metric: "реактивное управление")
    painCard(x: 1400, y: 320, w: 410, h: 300, title: "Цена ошибки", body: "Один пропуск срока легко съедает месячную экономию", metric: "потери 300к+ ₽")
    drawText("Вывод: автоматизация юропераций дешевле, чем 1-2 серьезные процессные ошибки в квартал", rect: NSRect(x: 110, y: 690, width: 1700, height: 80), size: 30, weight: .bold, color: c(0xF5F7FB))
}

func slide3() {
    drawBackground()
    sectionTitle("Решение: единый цикл действий", "От записи заседания до конкретного плана 24/72")

    let steps = ["Загрузка записи", "Расшифровка", "AI-риски и сроки", "План 24/72", "Контроль исполнения"]
    for i in 0..<steps.count {
        let x = 110 + CGFloat(i) * 338
        roundedRect(NSRect(x: x, y: 420, width: 300, height: 180), radius: 20, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)
        drawText("0\(i+1)", rect: NSRect(x: x + 24, y: 450, width: 60, height: 44), size: 34, weight: .bold, color: c(0xF59E0B))
        drawText(steps[i], rect: NSRect(x: x + 24, y: 500, width: 250, height: 70), size: 26, weight: .semibold)
        if i < steps.count - 1 {
            roundedRect(NSRect(x: x + 304, y: 500, width: 26, height: 10), radius: 5, fill: c(0xF59E0B, 0.9))
        }
    }

    roundedRect(NSRect(x: 1230, y: 720, width: 580, height: 260), radius: 20, fill: c(0x121A2F, 0.95), stroke: c(0x2B3550), line: 2)
    drawText("Прогресс расшифровки", rect: NSRect(x: 1260, y: 760, width: 520, height: 40), size: 24, weight: .semibold, color: c(0xA6B0C5))
    roundedRect(NSRect(x: 1260, y: 810, width: 520, height: 34), radius: 17, fill: c(0x2B3550))
    roundedRect(NSRect(x: 1260, y: 810, width: 360, height: 34), radius: 17, fill: c(0xF59E0B))
    drawText("69%", rect: NSRect(x: 1640, y: 807, width: 120, height: 34), size: 24, weight: .bold)
}

func slide4() {
    drawBackground()
    sectionTitle("Что внутри продукта", "Пять модулей в одной операционной панели")

    featureCard(x: 110, y: 320, w: 560, h: 190, title: "Intake", body: "Структурирует входящие кейсы и материалы")
    featureCard(x: 690, y: 320, w: 560, h: 190, title: "AI-анализ рисков", body: "Выделяет процессные и денежные угрозы")
    featureCard(x: 1270, y: 320, w: 540, h: 190, title: "Канбан", body: "Контроль статусов, сроков и ответственных")
    featureCard(x: 110, y: 530, w: 850, h: 200, title: "RAG по российской практике", body: "Ссылки на релевантные нормы: ГК РФ, АПК РФ, 152-ФЗ, ФССП")
    featureCard(x: 980, y: 530, w: 830, h: 200, title: "Управленческий отчет", body: "Картина рисков и прогресса для собственника")

    roundedRect(NSRect(x: 110, y: 760, width: 560, height: 220), radius: 16, fill: c(0x1B2745))
    roundedRect(NSRect(x: 690, y: 760, width: 560, height: 220), radius: 16, fill: c(0x1B2745))
    roundedRect(NSRect(x: 1270, y: 760, width: 540, height: 220), radius: 16, fill: c(0x1B2745))
    drawText("Dashboard", rect: NSRect(x: 132, y: 845, width: 200, height: 30), size: 22, weight: .semibold)
    drawText("Intake", rect: NSRect(x: 712, y: 845, width: 200, height: 30), size: 22, weight: .semibold)
    drawText("Отчет", rect: NSRect(x: 1292, y: 845, width: 200, height: 30), size: 22, weight: .semibold)
}

func slide5() {
    drawBackground()
    sectionTitle("Российская правовая специфика", "Локальные нормы встроены в рабочий контур")

    let blocks = [
        ("Досудебка", "Контроль обязательного претензионного порядка"),
        ("АПК РФ", "Трекинг процессуальных сроков и напоминания"),
        ("152-ФЗ", "Маркировка ПДн-рисков и режим доступа"),
        ("ФССП", "Контроль стадий исполнительного производства")
    ]

    for i in 0..<4 {
        let x = 110 + CGFloat(i % 2) * 860
        let y = 340 + CGFloat(i / 2) * 290
        roundedRect(NSRect(x: x, y: y, width: 840, height: 250), radius: 24, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)
        roundedRect(NSRect(x: x + 28, y: y + 36, width: 72, height: 72), radius: 36, fill: c(0xF59E0B, 0.20))
        drawText("\(i+1)", rect: NSRect(x: x + 54, y: y + 52, width: 30, height: 30), size: 22, weight: .bold, color: c(0xF59E0B), align: .center)
        drawText(blocks[i].0, rect: NSRect(x: x + 120, y: y + 40, width: 680, height: 50), size: 34, weight: .bold)
        drawText(blocks[i].1, rect: NSRect(x: x + 120, y: y + 100, width: 680, height: 100), size: 24, weight: .medium, color: c(0xA6B0C5))
    }
}

func slide6() {
    drawBackground()
    sectionTitle("Экономика для собственника", "Часы команды напрямую превращаются в деньги и скорость")

    roundedRect(NSRect(x: 110, y: 320, width: 1240, height: 620), radius: 20, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)

    drawText("Метрика", rect: NSRect(x: 150, y: 360, width: 450, height: 40), size: 24, weight: .bold)
    drawText("До", rect: NSRect(x: 700, y: 360, width: 140, height: 40), size: 24, weight: .bold)
    drawText("После", rect: NSRect(x: 900, y: 360, width: 170, height: 40), size: 24, weight: .bold)
    drawText("Эффект", rect: NSRect(x: 1110, y: 360, width: 170, height: 40), size: 24, weight: .bold)

    let rows = [
        ("Сбор материалов по делу", "6-8 ч", "1-2 ч", "-70%"),
        ("Подготовка досудебного плана", "4-6 ч", "1-2 ч", "-60%"),
        ("Контроль сроков и статусов", "реактивно", "проактивно", "без просрочек"),
        ("Вовлечение руководителя", "2-3 ч/нед", "30-45 мин", "-75%")
    ]

    for i in 0..<rows.count {
        let y = 430 + CGFloat(i) * 118
        roundedRect(NSRect(x: 140, y: y, width: 1180, height: 96), radius: 12, fill: c(0x1B2745, 0.55))
        drawText(rows[i].0, rect: NSRect(x: 160, y: y + 28, width: 500, height: 40), size: 23, weight: .medium)
        drawText(rows[i].1, rect: NSRect(x: 700, y: y + 28, width: 160, height: 40), size: 23, weight: .semibold, color: c(0xA6B0C5))
        drawText(rows[i].2, rect: NSRect(x: 900, y: y + 28, width: 170, height: 40), size: 23, weight: .semibold)
        drawText(rows[i].3, rect: NSRect(x: 1110, y: y + 28, width: 190, height: 40), size: 23, weight: .bold, color: c(0xF59E0B))
    }

    roundedRect(NSRect(x: 1380, y: 320, width: 430, height: 620), radius: 20, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)
    drawText("ROI-модель", rect: NSRect(x: 1440, y: 350, width: 320, height: 40), size: 30, weight: .bold, color: c(0xF59E0B), align: .center)
    let kpis = ["120+ ч/мес\nвысвобождаем", "≈ 360 000 ₽/мес\nэффект*", "Окупаемость\n< 1 месяца"]
    for i in 0..<kpis.count {
        let y = 360 + CGFloat(i) * 190
        roundedRect(NSRect(x: 1410, y: y, width: 370, height: 160), radius: 16, fill: c(0x1B2745))
        drawText(kpis[i], rect: NSRect(x: 1440, y: y + 38, width: 320, height: 100), size: 34, weight: .bold, color: c(0xF59E0B), align: .center)
    }
    drawText("* расчет для команды 3 юриста при ставке 3 000 ₽/час", rect: NSRect(x: 1410, y: 930, width: 370, height: 30), size: 16, weight: .medium, color: c(0xA6B0C5), align: .center)
}

func slide7() {
    drawBackground()
    sectionTitle("Кейс: спор по поставке на 12,4 млн ₽", "За 72 часа фиксируем позицию и убираем риск срыва претензионного срока")

    roundedRect(NSRect(x: 110, y: 330, width: 540, height: 620), radius: 20, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)
    roundedRect(NSRect(x: 690, y: 330, width: 540, height: 620), radius: 20, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)
    roundedRect(NSRect(x: 1270, y: 330, width: 540, height: 620), radius: 20, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)

    drawText("Входные данные", rect: NSRect(x: 140, y: 370, width: 480, height: 50), size: 30, weight: .bold, color: c(0xF59E0B))
    drawText("Договор + 6 допсоглашений\n132 письма из почты\nАудио переговоров (78 мин)\nАкт сверки и платежи", rect: NSRect(x: 140, y: 430, width: 480, height: 300), size: 24, weight: .medium, color: c(0xF5F7FB))

    drawText("Риски", rect: NSRect(x: 720, y: 370, width: 480, height: 50), size: 30, weight: .bold, color: c(0xF59E0B))
    drawText("Неустойка 1,1 млн ₽\nСлабая доказательная база по отгрузке\nРиск пропуска претензионного окна", rect: NSRect(x: 720, y: 430, width: 480, height: 300), size: 24, weight: .medium)

    drawText("Действия за 72 часа", rect: NSRect(x: 1300, y: 370, width: 480, height: 50), size: 30, weight: .bold, color: c(0xF59E0B))
    drawText("0-24 ч: расшифровка и таймлайн фактов\n24-48 ч: досудебная позиция + пакет док-в\n48-72 ч: претензия, задачи, контроль дедлайнов", rect: NSRect(x: 1300, y: 430, width: 470, height: 320), size: 24, weight: .medium)
    drawText("Результат: пакет готов за 3 дня вместо 8-10, дедлайн не сорван", rect: NSRect(x: 110, y: 980, width: 1700, height: 45), size: 28, weight: .bold, color: c(0xF5F7FB), align: .center)
}

func slide8() {
    drawBackground()
    sectionTitle("Пилот 14 дней", "Быстрый запуск, измеримый результат")

    roundedRect(NSRect(x: 110, y: 330, width: 1120, height: 620), radius: 24, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)
    drawText("Что делаем", rect: NSRect(x: 150, y: 380, width: 480, height: 50), size: 34, weight: .bold, color: c(0xF59E0B))
    drawText("1. Подключаем 1-2 потока юридической рутины\n2. Настраиваем intake, роли, сроки, отчетность\n3. Обучаем команду на реальных кейсах", rect: NSRect(x: 150, y: 440, width: 1000, height: 200), size: 25, weight: .medium)

    drawText("Метрики успеха", rect: NSRect(x: 150, y: 670, width: 480, height: 50), size: 34, weight: .bold, color: c(0xF59E0B))
    drawText("Сокращение времени цикла кейса\nСнижение ручных операций\nДоля задач, закрытых в срок", rect: NSRect(x: 150, y: 730, width: 1000, height: 180), size: 25, weight: .medium)

    roundedRect(NSRect(x: 1260, y: 330, width: 550, height: 620), radius: 24, fill: c(0xF59E0B), stroke: c(0xF97316), line: 2)
    drawText("Цена пилота", rect: NSRect(x: 1310, y: 420, width: 450, height: 60), size: 38, weight: .bold, color: c(0x121A2F), align: .center)
    drawText("59 000 ₽", rect: NSRect(x: 1310, y: 500, width: 450, height: 120), size: 92, weight: .black, color: c(0x121A2F), align: .center)
    drawText("Запуск без долгой интеграции", rect: NSRect(x: 1310, y: 640, width: 450, height: 60), size: 28, weight: .semibold, color: c(0x121A2F), align: .center)
}

func slide9() {
    drawBackground()
    sectionTitle("Запускаем пилот в вашей компании", "2 пилотных слота в этом месяце: фиксируем один за вами")

    roundedRect(NSRect(x: 110, y: 330, width: 1700, height: 620), radius: 28, fill: c(0x121A2F), stroke: c(0x2B3550), line: 2)
    roundedRect(NSRect(x: 170, y: 390, width: 760, height: 130), radius: 65, fill: c(0xF59E0B))
    drawText("Назначить слот на этой неделе", rect: NSRect(x: 210, y: 430, width: 680, height: 60), size: 44, weight: .bold, color: c(0x121A2F), align: .center)

    drawText("Пилот: 59 000 ₽ • 14 дней", rect: NSRect(x: 170, y: 560, width: 700, height: 50), size: 34, weight: .bold, color: c(0xA6B0C5))
    drawText("90 000 ₽/мес", rect: NSRect(x: 170, y: 620, width: 600, height: 90), size: 68, weight: .black, color: c(0xF59E0B))

    roundedRect(NSRect(x: 980, y: 390, width: 770, height: 430), radius: 20, fill: c(0x1B2745))
    drawText("Контакты", rect: NSRect(x: 1030, y: 450, width: 600, height: 50), size: 36, weight: .bold)
    drawText("Дмитрий\n@dmitriy\nfounder@example.com", rect: NSRect(x: 1030, y: 520, width: 600, height: 190), size: 34, weight: .medium)

    drawText("Мы не заменяем юристов. Мы даем скорость, контроль и предсказуемость.", rect: NSRect(x: 170, y: 900, width: 1580, height: 60), size: 28, weight: .semibold, color: c(0xA6B0C5), align: .center)
}

var mediaBox = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
guard let consumer = CGDataConsumer(url: URL(fileURLWithPath: outputPath) as CFURL),
      let ctx = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
    fputs("Failed to create PDF context\n", stderr)
    exit(1)
}

let slides: [() -> Void] = [slide1, slide2, slide3, slide4, slide5, slide6, slide7, slide8, slide9]

for draw in slides {
    ctx.beginPDFPage(nil)
    ctx.saveGState()
    ctx.translateBy(x: 0, y: pageHeight)
    ctx.scaleBy(x: 1, y: -1)
    let ns = NSGraphicsContext(cgContext: ctx, flipped: true)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = ns
    draw()
    NSGraphicsContext.restoreGraphicsState()
    ctx.restoreGState()
    ctx.endPDFPage()
}

ctx.closePDF()
print("Created \(outputPath)")
