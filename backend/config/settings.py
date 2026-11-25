"""BM Examer — Django sozlamalari.

Ishlab chiqish (development) uchun standart qiymatlar shu yerda. Serverga chiqarishda
DJANGO_SECRET_KEY, DJANGO_DEBUG, DJANGO_ALLOWED_HOSTS va CORS_ALLOWED_ORIGINS muhit
o'zgaruvchilari orqali beriladi.
"""
import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-only-insecure-key-change-me-in-production')
DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'
ALLOWED_HOSTS = [h for h in os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'django_filters',
    'apps.accounts',
    'apps.subjects',
    'apps.question_bank',
    'apps.tests_app',
    'apps.results',
    'apps.core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

def _clean_db_url(raw):
    """Neon'dan nusxalashda qo'shilib qolishi mumkin bo'lgan ortiqcha qismlarni olib tashlaydi:
    bo'sh joylar, qo'shtirnoqlar, `psql '...'` yoki `DATABASE_URL=...` ko'rinishi."""
    s = (raw or '').strip()
    if s.lower().startswith('psql'):
        s = s[4:].strip()
    if s.upper().startswith('DATABASE_URL='):
        s = s.split('=', 1)[1].strip()
    return s.strip('\'"` \t\r\n')


DATABASE_URL = _clean_db_url(os.environ.get('DATABASE_URL', ''))
if DATABASE_URL:
    # Serverda: PostgreSQL (masalan Neon). Ulanishlar qayta ishlatiladi, SSL majburiy.
    import dj_database_url
    _db = dj_database_url.parse(DATABASE_URL, conn_max_age=600, conn_health_checks=True)
    # Tashqi baza (Neon va h.k.) — SSL majburiy; Render ichki manzili (nuqtasiz, masalan dpg-xxx-a) — shart emas
    if '.' in (_db.get('HOST') or ''):
        _db.setdefault('OPTIONS', {}).setdefault('sslmode', 'require')
    DATABASES = {'default': _db}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 6}},
]

LANGUAGE_CODE = 'uz'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
# React sayt (npm run build natijasi) shu papkadan beriladi — backend va frontend bitta manzilda ishlaydi
FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
# Serverda rasmlar bazada saqlanadi (bepul hostingda disk qayta ishga tushganda tozalanadi)
STORAGES = {
    'default': {'BACKEND': 'apps.core.storage.DatabaseStorage' if DATABASE_URL else 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ('rest_framework_simplejwt.authentication.JWTAuthentication',),
    'DEFAULT_PERMISSION_CLASSES': ('rest_framework.permissions.IsAuthenticated',),
    'DEFAULT_FILTER_BACKENDS': ('django_filters.rest_framework.DjangoFilterBackend',),
    'UNAUTHENTICATED_USER': None,
    # ?format=xlsx|docx|pdf eksport uchun ishlatiladi — DRF'ning o'z format almashtirishini o'chiramiz
    'URL_FORMAT_OVERRIDE': None,
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}

# React (Vite) dev serveri
CORS_ALLOWED_ORIGINS = [o for o in os.environ.get('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if o]

DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # base64 rasmlar uchun

# Serverda (DEBUG=0) xavfsizlik sozlamalari
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',') if o]

# Render o'z manzilini RENDER_EXTERNAL_HOSTNAME orqali beradi — qo'lda yozish shart emas
RENDER_HOST = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if RENDER_HOST:
    ALLOWED_HOSTS.append(RENDER_HOST)
    CSRF_TRUSTED_ORIGINS.append(f'https://{RENDER_HOST}')
    CORS_ALLOWED_ORIGINS.append(f'https://{RENDER_HOST}')
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
