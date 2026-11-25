import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Admin akkauntini muhit o'zgaruvchilaridan yaratadi yoki parolini yangilaydi (Render bepul tarifida konsol yo'q).

    ADMIN_USERNAME va ADMIN_PASSWORD berilgan bo'lsa:
    - bunday foydalanuvchi bo'lmasa — admin yaratiladi;
    - bor bo'lsa va paroli ADMIN_PASSWORD bilan mos kelmasa — parol ADMIN_PASSWORD ga almashtiriladi.
    Shu tufayli unutilgan parolni Render'dagi ADMIN_PASSWORD ni o'zgartirib tiklash mumkin.
    """
    help = "ADMIN_USERNAME / ADMIN_PASSWORD bo'yicha adminni yaratadi yoki parolini yangilaydi"

    def handle(self, *args, **options):
        username = os.environ.get('ADMIN_USERNAME', '').strip()
        password = os.environ.get('ADMIN_PASSWORD', '')
        if not username or not password:
            self.stdout.write('ADMIN_USERNAME / ADMIN_PASSWORD berilmagan — admin yaratilmadi.')
            return
        User = get_user_model()
        user = User.objects.filter(username=username).first()
        if user is None:
            User.objects.create_superuser(username=username, email='', password=password)
            self.stdout.write(self.style.SUCCESS(f'Admin "{username}" yaratildi.'))
            return
        changed = []
        if not user.check_password(password):
            user.set_password(password)
            changed.append('parol')
        if not (user.is_superuser and user.is_staff and user.is_active):
            user.is_superuser = user.is_staff = user.is_active = True
            changed.append('huquqlar')
        if changed:
            user.save()
            self.stdout.write(self.style.SUCCESS(f'Admin "{username}": {", ".join(changed)} yangilandi.'))
        else:
            self.stdout.write(f'Admin "{username}" allaqachon mavjud.')
