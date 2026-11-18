# PROJECT_CONTEXT — BM_exmer_Zuxra

## Sessiya: 2026-10-14

### Nima qilindi
Claude Code agent tizimi o'rnatildi (loyiha kodi hali yo'q, papka bo'sh edi).

### Yaratilgan fayllar
Global (`~/.claude/`):
- `settings.json` — `model: sonnet` + PostToolUse hooklar (tsc + py_compile)
- `CLAUDE.md` — til, javob qoidalari, agent routing jadvali
- `agents/_domain.md` — umumiy loyiha konteksti
- `agents/` — backend-explorer, backend-bugfix, backend-feature, frontend-explorer, frontend-bugfix, frontend-feature, git-ops

Loyiha:
- `.claude/commands/start.md`, `.claude/commands/stop.md`
- `PROJECT_CONTEXT.md` (shu fayl)

### Stack
FULLSTACK (React + Python) — rejalashtirilgan.

## Reja o'zgarishi: 2026-10-19
- Git/GitHub ishlari vaqtincha to'xtatildi (GitHub akkaunt hali yo'q)
- 1-bosqich: frontend to'liq Artifact sifatida yasaladi
- 2-bosqich: frontend tayyor bo'lgach backendga o'tiladi

## Sessiya: 2026-10-19 — Frontend prototip v1
Reja hujjati: `C:\Users\user\Downloads\Telegram Desktop\development_plan.md` (BM_examer v2.0)
- `prototype/bm_examer.html` — butun frontend bitta HTML artifaktda (React 18 UMD + htm, KaTeX, SheetJS)
- Artifact: https://claude.ai/artifact/B1qbjPy1MoPkKjd1uKy3Kg
- Mock ma'lumotlar localStorage'da (`bm_examer.db.v1`); "Demo ma'lumotlarni tiklash" tugmasi bor
- Demo loginlar: admin/admin123, dilnoza/teacher123, aziz/student123
- Qamrab olingan: Bosqich 3–6 (auth, admin, teacher, student) + Bosqich 7 dan responsive, grafiklar, toast, fullscreen
- Export (PDF/Excel/Word) — faqat UI; fayl backend bosqichida yaratiladi
- Kod tuzilishi reja papkalariga mos bo'limlarga ajratilgan (utils, api, context, components, pages) — keyin Vite loyihaga ko'chiriladi

## Sessiya: 2026-10-20 — Prototip o'zgarishlari (backend uchun muhim qarorlar)
- Fanlar: faqat Matematika, Rus tili, Ingliz tili
- Test tarkibi MAJBURIY: 30 savol = 20 variantli (A–D) + 10 yozma; aks holda faollashtirib bo'lmaydi
- Yangi savol turi `written`: `answers` (qabul qilinadigan javoblar ro'yxati); solishtirish: trim, lowercase, bo'shliqlar, ё→е, 3,5=3.5
- Qat'iy rejim (`strict_mode`, standart yoqilgan): tab/oyna almashtirish, copy/paste, F12, PrintScreen, fullscreen'dan chiqish → urinish darhol 0 ball, `disqualified` + `violation`
  - Backendda ham tekshirish kerak (frontend chetlab o'tilishi mumkin)
- Ball tizimi (jami 50): 1–10-savollar 1,2; 11–20-savollar 1,8; 21–30-savollar (yozma) 2 ball — o'rniga qarab avtomatik
  - Tartib doim: variantli (1–20), keyin yozma (21–30); aralashtirish faqat har bir 10 talik ichida
- Sahifalash: admin jadvallari 10 tadan, o'qituvchi testlari 9 tadan
- Mavzu: standart "Ko'k-kulrang" + oq fon; foydalanuvchi qora fon va 7 ta palitradan tanlay oladi

## Sessiya: 2026-10-28 — TZ (9G05CH.docx) bilan moslashtirish
- TZ: `C:\Users\user\Downloads\Telegram Desktop\9G05CH.docx` (Texnik topshiriq, ballar bilan)
- Qo'shildi: teacher fanlarni boshqaradi (FR-SUBJ-2), student "Fanlar" sahifasi (FR-SUBJ-1), 403 sahifasi,
  start'da limit tekshiruvi (mock API), eksportda jadvalni nusxalash (TSV), testda ball tizimi tanlovi: `scoring: 'standard' | 'free'`
- Foydalanuvchi qarori: oq fon standart qoladi (TZ NFR-2 dark default — ataylab farq), qat'iy rejim standart yoqilgan (TZ'dan qattiqroq)
- BACKENDDA MAJBURIY (qabul mezonlari): JWT; student → teacher/admin endpoint = 403; limit oshsa POST start = rad;
  PDF/Excel/Word fayl eksporti (openpyxl, python-docx, ReportLab); tab_switches saqlanadi

## 2026-10-28 — Qat'iy rejim qayta ishlandi
- Endi 0 ball EMAS: 3 ta ogohlantirish (MAX_WARNINGS), 4-qoidabuzarlikda `force_submitted` — ishlangan javoblar baholanadi
- Qoidabuzarlik: tab/oyna almashtirish, copy/paste, F12/Ctrl+U, PrintScreen/Win+Shift+S, fullscreen'dan chiqish; 1,5 s ichidagi hodisalar bitta hisoblanadi
- Ekran qorayishi: oyna fokusni yo'qotsa yoki PrintScreen bosilsa qora qatlam; print CSS'da sahifa yashiriladi
- Cheklov: brauzer OS darajasidagi skrinshotni to'liq to'sa olmaydi (telefon kamerasi, ba'zi dasturlar)

## 2026-10-30
- Admin: foydalanuvchini bittalab va ko'plab (ro'yxat/Excel) qo'shish; login/parol avtomatik, natijada nusxalanadigan ro'yxat
- Foydalanuvchi qarori: fanlarni FAQAT admin boshqaradi (teacher hech qachon) — TZ FR-SUBJ-2 dagi "(va teacher)" ishlatilmaydi;
  backendda subjects POST/PUT/DELETE = IsAdmin

## 2026-10-30 — To'liq ekran majburiy, skrinshotdan himoya
- Test boshlanishida to'liq ekran so'raladi; to'liq ekransiz savollar ko'rinmaydi ("fs-gate" qatlami, vaqt to'xtamaydi)
- Win/Cmd tugmasi bosilishi bilanoq savollar qora qatlam bilan yashiriladi (Win+Shift+S, Cmd+Shift+3/4 oldidan)
- Cheklov: brauzer OS skrinshotini 100% to'xtata olmaydi (PrtSc ba'zan oldin ishlaydi, telefon kamerasi).
  Haqiqiy imtihon uchun tavsiya: Safe Exam Browser (SEB) yoki mobil ilova (Android FLAG_SECURE)

## 2026-10-30 — Demo deploy
- `deploy/index.html` = prototype + to'liq HTML qobiq (doctype, head, favicon, description) — hostingga tayyor
- Prototip o'zgarsa, deploy/index.html qayta yig'ilishi kerak (prototipning o'zi artifakt qobig'isiz)
- Reja: Netlify Drop orqali demo havola; haqiqiy sayt — backenddan keyin

### Keyingi sessiya uchun eslatma
- Git for Windows (Git Bash bilan) va Node.js o'rnatilmagan — hooklar va git amallari shularsiz ishlamaydi
- Loyiha papkasida `git init` qilish kerak
- Kod yozilgach `~/.claude/agents/_domain.md` dagi "hali aniqlanmagan" joylarni to'ldirish (framework, DB, API prefix, deploy)
