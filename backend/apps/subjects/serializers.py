from rest_framework import serializers

from .models import Subject


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'description', 'icon', 'color', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        if not attrs.get('icon') and attrs.get('name'):
            attrs['icon'] = attrs['name'].strip()[:2]
        return attrs
