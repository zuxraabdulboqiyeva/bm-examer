# BM Examer'ni Render'ga joylash (bepul)

Natija: sayt `https://bm-examer.onrender.com` (yoki shunga o'xshash) manzilida ishlaydi.

Ikkita bepul xizmat kerak:
- **Neon** — ma'lumotlar bazasi (foydalanuvchilar, testlar, natijalar, rasmlar shu yerda saqlanadi)
- **Render** — saytning o'zi

Nega Neon: Render'ning bepul serveri diskini har qayta ishga tushganda tozalaydi, Render'ning bepul bazasi esa 30 kundan keyin o'chadi. Neon'dagi bepul baza muddatsiz saqlanadi.

## 1. Neon — ma'lumotlar bazasi
1. **neon.tech** → **Sign up** (GitHub orqali kirish mumkin).
2. Yangi loyiha: nomi `bm-examer`, region **Europe (Frankfurt)**, Postgres versiyasi — standart.
3. **Connect** tugmasi → **Connection string** ni nusxalang. U shunday ko'rinadi:
   `postgresql://neondb_owner:...@ep-....eu-central-1.aws.neon.tech/neondb?sslmode=require`
   Bu — maxfiy kalit, uni hech kimga yubormang.

## 2. Render — sayt
1. **render.com** → **Get Started** → **GitHub** orqali kiring.
2. **New +** → **Blueprint** → `zuxraabdulboqiyeva/bm-examer` omborini tanlang (**Connect**).
3. Render `render.yaml` faylini o'qib, 3 ta qiymatni so'raydi:
   - **DATABASE_URL** — Neon'dan nusxalangan qator
   - **ADMIN_USERNAME** — admin logini (masalan `admin`)
   - **ADMIN_PASSWORD** — admin paroli (kuchli parol tanlang)
4. **Apply** ni bosing. 5–10 daqiqa kuting, holat **Live** bo'lsa — sayt tayyor.
5. Sayt manzili Render sahifasining yuqorisida ko'rinadi. Admin login va parolingiz bilan kiring.

## Keyinchalik: yangilash
Kod GitHub'ga yuklanishi bilan Render saytni o'zi yangilaydi.

## Bilish kerak
- Bepul serverda sayt 15 daqiqa hech kim kirmasa "uxlab qoladi". Keyingi kirishda **~1 daqiqa** ochiladi, keyin odatdagidek tez ishlaydi.
- Admin parolini saytdagi **Profil** sahifasida o'zgartirsangiz, yangi parol saqlanib qoladi.
