# BM Examer

Onlayn test platformasi: o'qituvchi test tuzadi, o'quvchi kod bilan kirib yechadi, ball va reyting avtomatik hisoblanadi.

- **backend/** — Django 5 + Django REST Framework (JWT), SQLite
- **frontend/** — React 18 + Vite

## Ishga tushirish (Windows)

1-oyna — backend (server):

```
cd backend
.venv\Scripts\python.exe manage.py runserver
```

2-oyna — frontend (sayt):

```
cd frontend
npm run dev
```

Brauzerda: http://localhost:5173

Demo akkauntlar: `admin / admin123`, `dilnoza / teacher123`, `aziz / student123`.

Demo ma'lumotlarni qayta tiklash: `backend\.venv\Scripts\python.exe backend\manage.py seed_demo --reset`

Backend testlari: `backend\.venv\Scripts\python.exe backend\manage.py test apps.core`
