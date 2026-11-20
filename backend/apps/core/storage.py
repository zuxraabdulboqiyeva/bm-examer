import mimetypes
import os
import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


@deconstructible
class DatabaseStorage(Storage):
    """Fayllarni StoredFile jadvalida saqlaydigan Django storage (serverda DATABASE_URL bo'lsa yoqiladi)."""

    def _model(self):
        from apps.core.models import StoredFile
        return StoredFile

    def _open(self, name, mode='rb'):
        obj = self._model().objects.filter(name=name).first()
        if obj is None:
            raise FileNotFoundError(name)
        f = ContentFile(bytes(obj.content), name=name)
        f.content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        return f

    def _save(self, name, content):
        content.seek(0)
        data = content.read()
        self._model().objects.update_or_create(name=name, defaults={'content': data, 'size': len(data)})
        return name

    def get_available_name(self, name, max_length=None):
        if not self.exists(name):
            return name
        root, ext = os.path.splitext(name)
        return f'{root}_{uuid.uuid4().hex[:7]}{ext}'

    def exists(self, name):
        return self._model().objects.filter(name=name).exists()

    def delete(self, name):
        self._model().objects.filter(name=name).delete()

    def size(self, name):
        obj = self._model().objects.filter(name=name).only('size').first()
        return obj.size if obj else 0

    def url(self, name):
        return f'{settings.MEDIA_URL}{name}'
