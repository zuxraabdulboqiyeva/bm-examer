import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Admin akkauntini muhit o'zgaruvchilaridan yaratadi (Render bepul tarifida konsol yo'q).

    ADMIN_USERNAME va ADMIN_PASSWORD berilgan bo'lsa va bunday foydalanuvchi hali bo'lmasa — yaratiladi.
    Mavjud adminning paroli o'zgartirilmaydi (saytda o'zgartirilgan parol saqlanib qoladi).
    """
    help = "ADMIN_USERNAME / ADMIN_PASSWORD bo'yicha admin yaratadi (agar yo'q bo'lsa)"

    def handle(self, *args, **options):
        username = os.environ.get('ADMIN_USERNAME', '').strip()
        password = os.environ.get('ADMIN_PASSWORD', '')
        if not username or not password:
            self.stdout.write('ADMIN_USERNAME / ADMIN_PASSWORD berilmagan — admin yaratilmadi.')
            return
        User = get_user_model()
        if User.objects.filter(username=username).exists():
            self.stdout.write(f'Admin "{username}" allaqachon mavjud.')
            return
        User.objects.create_superuser(username=username, email='', password=password)
        self.stdout.write(self.style.SUCCESS(f'Admin "{username}" yaratildi.'))
