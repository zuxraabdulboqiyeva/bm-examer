import secrets

from django.conf import settings
from django.db import models

CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def gen_test_code():
    """Unikal test kodi: BM-XXXXXX (O/0, I/1 kabi adashtiriladigan belgilarsiz)."""
    while True:
        code = 'BM-' + ''.join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not Test.objects.filter(test_code=code).exists():
            return code


class Test(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Qoralama'
        ACTIVE = 'active', 'Faol'
        COMPLETED = 'completed', 'Yakunlangan'

    class Difficulty(models.TextChoices):
        EASY = 'easy', 'Oson'
        MEDIUM = 'medium', "O'rta"
        HARD = 'hard', 'Qiyin'

    class ShowResults(models.TextChoices):
        SCORE_ONLY = 'score_only', 'Faqat ball va foiz'
        CORRECT_ANSWERS = 'correct_answers', "To'g'ri javoblar bilan"
        DETAILED = 'detailed', 'Batafsil tahlil'

    class Scoring(models.TextChoices):
        STANDARD = 'standard', '50 ballik standart'
        FREE = 'free', 'Erkin'

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    subject = models.ForeignKey('subjects.Subject', on_delete=models.PROTECT, related_name='tests')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tests')
    test_code = models.CharField(max_length=12, unique=True, default=gen_test_code)
    duration_minutes = models.PositiveIntegerField(default=40)
    difficulty = models.CharField(max_length=10, choices=Difficulty.choices, default=Difficulty.MEDIUM)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    shuffle_questions = models.BooleanField(default=True)
    shuffle_choices = models.BooleanField(default=True)
    max_attempts = models.PositiveIntegerField(default=1, help_text='0 = cheksiz')
    show_results = models.CharField(max_length=20, choices=ShowResults.choices, default=ShowResults.DETAILED)
    strict_mode = models.BooleanField(default=True)
    scoring = models.CharField(max_length=10, choices=Scoring.choices, default=Scoring.STANDARD)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.title} ({self.test_code})'


class Question(models.Model):
    class Type(models.TextChoices):
        SINGLE = 'single', 'Bitta javob'
        MULTIPLE = 'multiple', "Ko'p javob"
        TRUE_FALSE = 'true_false', "Rost / Yolg'on"
        WRITTEN = 'written', 'Yozma javob'

    # Savol yo testga, yo bankka tegishli
    test = models.ForeignKey(Test, null=True, blank=True, on_delete=models.CASCADE, related_name='questions')
    bank = models.ForeignKey('question_bank.QuestionBank', null=True, blank=True, on_delete=models.CASCADE,
                             related_name='questions')
    question_type = models.CharField(max_length=12, choices=Type.choices, default=Type.SINGLE)
    text = models.TextField()
    image = models.ImageField(upload_to='questions/', blank=True, null=True)
    difficulty = models.CharField(max_length=10, choices=Test.Difficulty.choices, default=Test.Difficulty.MEDIUM)
    points = models.FloatField(default=1)
    order = models.PositiveIntegerField(default=0)
    answers = models.JSONField(default=list, blank=True, help_text="Yozma savol uchun qabul qilinadigan javoblar")

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.text[:60]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='choices')
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.text[:60]
