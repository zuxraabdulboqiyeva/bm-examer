from rest_framework import serializers, viewsets

from apps.accounts.permissions import IsTeacherOrAdmin
from apps.subjects.models import Subject
from .models import QuestionBank


class QuestionBankSerializer(serializers.ModelSerializer):
    subject_id = serializers.PrimaryKeyRelatedField(source='subject', queryset=Subject.objects.all())
    created_by = serializers.IntegerField(source='created_by_id', read_only=True)

    class Meta:
        model = QuestionBank
        fields = ['id', 'name', 'subject_id', 'created_by', 'created_at']
        read_only_fields = ['id', 'created_at']


class QuestionBankViewSet(viewsets.ModelViewSet):
    """FR-BANK-1: bank yaratish (fan bilan bog'liq). O'qituvchi faqat o'z banklarini ko'radi."""
    serializer_class = QuestionBankSerializer
    permission_classes = [IsTeacherOrAdmin]

    def get_queryset(self):
        u = self.request.user
        qs = QuestionBank.objects.all()
        return qs if u.role == 'admin' else qs.filter(created_by=u)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
