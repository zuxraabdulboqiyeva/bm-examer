"""Urinish jarayoni: boshlash, vaqt tugashi, qoidabuzarlik, topshirish, natijani ko'rsatish."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.tests_app.models import Question
from apps.tests_app.serializers import QuestionSerializer, StudentQuestionSerializer
from apps.tests_app.services import MAX_WARNINGS, build_order, grade
from .models import TestAttempt
from .serializers import AttemptSerializer

GRACE = timedelta(seconds=5)  # tarmoq kechikishi uchun


def qmap_for(attempt):
    qs = Question.objects.filter(pk__in=attempt.order).prefetch_related('choices')
    return {q.id: q for q in qs}


def _apply_grade(attempt, finished_at, **extra):
    g = grade(attempt, qmap_for(attempt))
    g.pop('per')
    for k, v in g.items():
        setattr(attempt, k, v)
    attempt.is_completed = True
    attempt.finished_at = finished_at
    for k, v in extra.items():
        setattr(attempt, k, v)
    attempt.save()
    return attempt


def finalize_if_expired(attempt):
    """Vaqt tugagan bo'lsa, urinish serverda avtomatik topshiriladi (FR-RUN-1)."""
    if not attempt.is_completed and timezone.now() > attempt.deadline + GRACE:
        _apply_grade(attempt, attempt.deadline)
    return attempt


def start_attempt(test, student):
    """POST /api/tests/{id}/start/ — limit va holat serverda tekshiriladi (qabul mezoni 2)."""
    if test.status != 'active':
        raise ValidationError({'detail': "Test faol emas — boshlab bo'lmaydi"})
    with transaction.atomic():
        mine = TestAttempt.objects.select_for_update().filter(test=test, student=student)
        for a in mine.filter(is_completed=False):
            finalize_if_expired(a)
        open_attempt = mine.filter(is_completed=False).first()
        if open_attempt:
            return open_attempt, False
        used = mine.filter(is_completed=True).count()
        if test.max_attempts and used >= test.max_attempts:
            raise PermissionDenied("Urinishlar limiti tugagan")
        questions = list(test.questions.all().prefetch_related('choices'))
        if not questions:
            raise ValidationError({'detail': "Testda savol yo'q"})
        order, choice_order = build_order(test, questions)
        attempt = TestAttempt.objects.create(test=test, student=student, attempt_number=used + 1, order=order,
                                             choice_order=choice_order, total_questions=len(order),
                                             max_score=round(sum(q.points for q in questions), 1))
        return attempt, True


def save_answer(attempt, question_id, value):
    finalize_if_expired(attempt)
    if attempt.is_completed:
        raise ValidationError({'detail': 'Urinish yakunlangan'})
    if int(question_id) not in [int(x) for x in attempt.order]:
        raise ValidationError({'detail': 'Bu savol shu testda yo\'q'})
    if not isinstance(value, list):
        value = [value]
    answers = dict(attempt.answers or {})
    answers[str(question_id)] = value[:10]
    attempt.answers = answers
    attempt.save(update_fields=['answers'])
    return attempt


def submit(attempt):
    finalize_if_expired(attempt)
    if attempt.is_completed:
        return attempt
    return _apply_grade(attempt, timezone.now())


def register_violation(attempt, reason):
    """Qat'iy rejim: 3 ta ogohlantirish, 4-sida test majburan topshiriladi (ishlangan javoblar baholanadi)."""
    finalize_if_expired(attempt)
    if attempt.is_completed:
        return attempt, 'completed'
    attempt.tab_switches += 1
    reason = (reason or "qoidabuzarlik")[:200]
    if attempt.test.strict_mode and attempt.tab_switches > MAX_WARNINGS:
        _apply_grade(attempt, timezone.now(), force_submitted=True, violation=reason)
        return attempt, 'force_submitted'
    attempt.save(update_fields=['tab_switches'])
    return attempt, 'warning'


def attempt_payload(attempt, request):
    """Test yechish uchun: savollar to'g'ri javoblarsiz, urinish tartibida."""
    qmap = qmap_for(attempt)
    questions = [StudentQuestionSerializer(qmap[int(q)], context={'request': request}).data for q in attempt.order if int(q) in qmap]
    return {
        'attempt': AttemptSerializer(attempt).data,
        'questions': questions,
        'deadline': attempt.deadline,
        'server_now': timezone.now(),
        'strict_mode': attempt.test.strict_mode,
        'max_warnings': MAX_WARNINGS,
    }


def result_payload(attempt, viewer, request):
    """Natija: o'quvchiga test sozlamasi (show_results) bo'yicha, o'qituvchi/admin uchun doim batafsil."""
    test = attempt.test
    mode = 'detailed' if viewer.role in ('teacher', 'admin') else test.show_results
    data = {'attempt': AttemptSerializer(attempt).data, 'mode': mode, 'questions': [], 'per': {}}
    if mode == 'score_only':
        return data
    qmap = qmap_for(attempt)
    g = grade(attempt, qmap)
    data['questions'] = [QuestionSerializer(qmap[int(q)], context={'request': request}).data
                         for q in attempt.order if int(q) in qmap]
    if mode == 'detailed':
        data['per'] = g['per']
    else:
        # faqat to'g'ri javoblar — o'quvchining tanlovlari ko'rsatilmaydi
        data['attempt'] = {**data['attempt'], 'answers': {}}
    return data
