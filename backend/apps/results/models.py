from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class TestAttempt(models.Model):
    """O'quvchining bitta test urinishi.

    Javoblar `answers` JSON maydonida saqlanadi: {"<question_id>": [choice_id, ...]} yoki yozma uchun ["matn"].
    `order` / `choice_order` — shu urinish uchun aralashtirilgan tartib.
    """
    test = models.ForeignKey('tests_app.Test', on_delete=models.CASCADE, related_name='attempts')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='attempts')
    attempt_number = models.PositiveIntegerField(default=1)
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    order = models.JSONField(default=list)
    choice_order = models.JSONField(default=dict)
    answers = models.JSONField(default=dict)
    score = models.FloatField(default=0)
    max_score = models.FloatField(default=0)
    correct_answers = models.PositiveIntegerField(default=0)
    total_questions = models.PositiveIntegerField(default=0)
    percentage = models.FloatField(default=0)
    tab_switches = models.PositiveIntegerField(default=0)
    force_submitted = models.BooleanField(default=False)
    violation = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['-started_at']

    @property
    def deadline(self):
        return self.started_at + timedelta(minutes=self.test.duration_minutes)

    def __str__(self):
        return f'{self.student} — {self.test} #{self.attempt_number}'
