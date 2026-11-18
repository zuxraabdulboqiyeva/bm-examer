from rest_framework import serializers

from .models import TestAttempt

PUBLIC_FIELDS = ['id', 'test_id', 'student_id', 'attempt_number', 'started_at', 'finished_at', 'is_completed', 'score',
                 'max_score', 'percentage', 'correct_answers', 'total_questions', 'tab_switches', 'force_submitted']


class AttemptSerializer(serializers.ModelSerializer):
    """To'liq urinish (o'quvchining o'zi, test egasi o'qituvchi va admin uchun)."""
    test_id = serializers.IntegerField(read_only=True)
    student_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = TestAttempt
        fields = PUBLIC_FIELDS + ['order', 'choice_order', 'answers', 'violation']
        read_only_fields = fields


class AttemptPublicSerializer(serializers.ModelSerializer):
    """Reyting uchun: javoblarsiz."""
    test_id = serializers.IntegerField(read_only=True)
    student_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = TestAttempt
        fields = PUBLIC_FIELDS
        read_only_fields = fields
