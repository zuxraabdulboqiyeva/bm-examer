# BM Examer'ni PythonAnywhere'ga joylash

Natija: sayt `https://SIZNINGLOGIN.pythonanywhere.com` manzilida ishlaydi. Hosting bepul, ma'lumotlar saqlanib qoladi.

## 1. Akkaunt
pythonanywhere.com → **Pricing & signup** → **Create a Beginner account** (bepul).
Login sayt manzili bo'lib qoladi, shuning uchun uni o'ylab tanlang (masalan `bmexamer`).

## 2. Web ilova yaratish
**Web** bo'limi → **Add a new web app** → **Next** → **Manual configuration** → **Python 3.12** → **Next**.

## 3. Kodni yuklab, sozlash
**Consoles** → **Bash**. Ochilgan oynaga quyidagini yozing:

```
git clone https://github.com/GITHUB_LOGIN/bm-examer.git ~/bm-examer && bash ~/bm-examer/deploy/pa_setup.sh
```

Bu 3–5 daqiqa davom etadi. Oxirida "Tayyor!" yozuvi chiqadi.

## 4. Web bo'limida 3 ta sozlama
**Web** bo'limiga qayting:
- **Virtualenv**: `/home/SIZNINGLOGIN/bm-examer/backend/.venv`
- **Static files** bo'limiga ikkita qator qo'shing:
  - URL `/static/` → Directory `/home/SIZNINGLOGIN/bm-examer/backend/staticfiles`
  - URL `/media/` → Directory `/home/SIZNINGLOGIN/bm-examer/backend/media`
- Yuqoridagi yashil **Reload** tugmasini bosing.

## 5. Admin yaratish
Bash konsolida:

```
cd ~/bm-examer/backend && .venv/bin/python manage.py createsuperuser
```

Login, email va parolni o'zingiz kiritasiz. Parol yozilayotganda ekranda ko'rinmaydi — bu normal holat.

## Keyinchalik: yangilash
Kodga o'zgarish kiritilib, GitHub'ga yuklangach, Bash konsolida:

```
bash ~/bm-examer/deploy/pa_setup.sh
```

## Eslatma
Bepul akkauntda sayt har **3 oyda** bir marta uzaytirilishi kerak: **Web** bo'limidagi **"Run until 3 months from today"** tugmasini bosing. PythonAnywhere buni oldindan emailda eslatadi.
