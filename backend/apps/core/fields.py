import base64
import binascii
import uuid

from django.core.files.base import ContentFile
from rest_framework import serializers

MAX_IMAGE_BYTES = 2 * 1024 * 1024


class Base64ImageField(serializers.ImageField):
    """Rasmni `data:image/png;base64,...` ko'rinishida qabul qiladi (frontend FileReader shunday beradi).

    Javobda to'liq URL qaytaradi. Bo'sh qiymat yoki null — rasmni olib tashlash.
    """

    def to_internal_value(self, data):
        if data in (None, ''):
            return None
        if isinstance(data, str):
            if data.startswith('http://') or data.startswith('https://') or data.startswith('/media/'):
                # O'zgarmagan mavjud rasm — qayta saqlamaymiz
                raise serializers.SkipField()
            if not data.startswith('data:image/'):
                raise serializers.ValidationError("Rasm data:image/... formatida bo'lishi kerak.")
            header, _, b64 = data.partition(';base64,')
            ext = header.split('/')[-1].lower().replace('jpeg', 'jpg')
            if ext not in ('png', 'jpg', 'gif', 'webp'):
                raise serializers.ValidationError('Faqat PNG, JPG, GIF yoki WEBP rasm.')
            try:
                raw = base64.b64decode(b64)
            except (binascii.Error, ValueError):
                raise serializers.ValidationError("Rasmni o'qib bo'lmadi.")
            if len(raw) > MAX_IMAGE_BYTES:
                raise serializers.ValidationError('Rasm 2 MB dan katta.')
            data = ContentFile(raw, name=f'{uuid.uuid4().hex}.{ext}')
        return super().to_internal_value(data)

    def to_representation(self, value):
        if not value:
            return None
        request = self.context.get('request')
        url = value.url
        return request.build_absolute_uri(url) if request else url
