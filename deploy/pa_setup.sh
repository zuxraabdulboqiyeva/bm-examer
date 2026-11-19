#!/bin/bash
# BM Examer — PythonAnywhere serverini sozlash.
# Bash konsolida ishga tushiriladi:  bash ~/bm-examer/deploy/pa_setup.sh
# Qayta ishga tushirsa ham bo'ladi (yangilanishdan keyin ham shu skript ishlatiladi).
set -e

APP="$HOME/bm-examer"
BACK="$APP/backend"
HOST="${USER}.pythonanywhere.com"
WSGI="/var/www/${USER}_pythonanywhere_com_wsgi.py"

echo "==> 1/5 Kod yangilanmoqda"
cd "$APP" && git pull --ff-only || true

echo "==> 2/5 Python muhiti (virtualenv) va kutubxonalar"
cd "$BACK"
[ -d .venv ] || python3.12 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt

echo "==> 3/5 Ma'lumotlar bazasi"
.venv/bin/python manage.py migrate --noinput

echo "==> 4/5 Sayt fayllari (static)"
.venv/bin/python manage.py collectstatic --noinput
mkdir -p "$BACK/media"

echo "==> 5/5 WSGI fayli (sayt sozlamalari)"
SECRET_FILE="$HOME/.bm_examer_secret"
[ -f "$SECRET_FILE" ] || .venv/bin/python -c "import secrets; print(secrets.token_urlsafe(50))" > "$SECRET_FILE"
chmod 600 "$SECRET_FILE"
cat > "$WSGI" <<EOF
# BM Examer — deploy/pa_setup.sh tomonidan yozilgan
import os, sys
sys.path.insert(0, '$BACK')
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
os.environ['DJANGO_DEBUG'] = '0'
os.environ['DJANGO_SECRET_KEY'] = open('$SECRET_FILE').read().strip()
os.environ['DJANGO_ALLOWED_HOSTS'] = '$HOST'
os.environ['CSRF_TRUSTED_ORIGINS'] = 'https://$HOST'
os.environ['CORS_ALLOWED_ORIGINS'] = 'https://$HOST'
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
EOF
touch "$WSGI"   # saytni qayta yuklash

echo
echo "Tayyor! Sayt manzili: https://$HOST"
echo "Admin hali yo'q bo'lsa:  cd $BACK && .venv/bin/python manage.py createsuperuser"
