from django.conf import settings
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import IsStudent, IsTeacherOrAdmin
from apps.core.exports import table_response
from apps.question_bank.models import QuestionBank
from apps.results.models import TestAttempt
from apps.results.services import attempt_payload, start_attempt
from .models import Question, Test
from .serializers import QuestionSerializer, TestSerializer
from .services import arrange, composition, composition_ok, composition_text, is_written

LETTERS = 'ABCDEF'


def can_manage_test(user, test):
    return user.role == 'admin' or (user.role == 'teacher' and test.created_by_id == user.id)


def _media_name_from_url(url):
    """Mavjud rasm URL'idan saqlangan fayl nomini oladi (bankdan nusxa olinganda rasmni bo'lishish uchun)."""
    if not isinstance(url, str):
        return None
    marker = settings.MEDIA_URL
    i = url.find(marker)
    return url[i + len(marker):] if i >= 0 else None


class TestViewSet(viewsets.ModelViewSet):
    """Testlar (FR-TEST). O'qituvchi o'zinikini, admin hammasini boshqaradi; o'quvchi faqat faol/yakunlanganlarni ko'radi."""
    serializer_class = TestSerializer

    def get_queryset(self):
        u = self.request.user
        qs = Test.objects.select_related('subject').prefetch_related('questions')
        if u.role == 'admin':
            return qs
        if u.role == 'teacher':
            return qs.filter(created_by=u)
        return qs.filter(status__in=['active', 'completed'])

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'activate', 'complete', 'questions',
                           'export_questions', 'export_results'):
            return [IsTeacherOrAdmin()]
        if self.action in ('start', 'by_code'):
            return [IsStudent()]
        return super().get_permissions()

    def get_object(self):
        obj = super().get_object()
        if self.action in ('update', 'partial_update', 'destroy', 'activate', 'complete', 'questions',
                           'export_questions', 'export_results') and not can_manage_test(self.request.user, obj):
            raise PermissionDenied("Bu test sizga tegishli emas")
        return obj

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        test = self.get_object()
        qs = list(test.questions.all())
        c = composition(qs)
        if test.scoring == 'free' and not c['total']:
            raise ValidationError({'detail': "Faollashtirishdan oldin kamida bitta savol qo'shing"})
        if test.scoring != 'free' and not composition_ok(c):
            raise ValidationError({'detail': composition_text(c)})
        test.status = 'active'
        test.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(test).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        test = self.get_object()
        test.status = 'completed'
        test.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(test).data)

    @action(detail=True, methods=['get', 'put'])
    def questions(self, request, pk=None):
        """GET — testning barcha savollari (to'g'ri javoblar bilan).
        PUT {questions:[...]} — ro'yxatni to'liq almashtiradi (tahrirlash sahifasidagi "Saqlash").
        id bor savollar yangilanadi, yangilari yaratiladi, ro'yxatda yo'qlari o'chiriladi."""
        test = self.get_object()
        if request.method == 'GET':
            return Response(QuestionSerializer(test.questions.all().prefetch_related('choices'), many=True,
                                               context={'request': request}).data)
        items = request.data.get('questions')
        if not isinstance(items, list):
            raise ValidationError({'questions': "Ro'yxat kerak"})
        existing = {q.id: q for q in test.questions.all()}
        saved, errors = [], {}
        with transaction.atomic():
            for i, item in enumerate(items):
                inst = existing.get(item.get('id')) if isinstance(item.get('id'), int) else None
                s = QuestionSerializer(inst, data=item, context={'request': request})
                if not s.is_valid():
                    errors[i] = s.errors
                    continue
                q = s.save(test=test, bank=None)
                if inst is None and isinstance(item.get('image'), str):
                    name = _media_name_from_url(item['image'])
                    if name:
                        q.image.name = name
                        q.save(update_fields=['image'])
                saved.append(q)
            if errors:
                transaction.set_rollback(True)
                return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
            keep = {q.id for q in saved}
            test.questions.exclude(pk__in=keep).delete()
            for q in arrange(test, saved):
                q.save(update_fields=['order', 'points'])
            test.save(update_fields=['updated_at'])
        return Response(QuestionSerializer(test.questions.all().prefetch_related('choices'), many=True,
                                           context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='by-code')
    def by_code(self, request):
        """GET /api/tests/by-code/?code=BM-XXXXXX (FR-TEST-4)"""
        code = (request.query_params.get('code') or '').strip().upper().replace(' ', '')
        if code and not code.startswith('BM-'):
            code = 'BM-' + code.removeprefix('BM')
        test = Test.objects.filter(test_code=code).first()
        if not test or test.status == 'draft':
            return Response({'detail': f"{code} kodli test topilmadi. Kodni o'qituvchingizdan qayta so'rang."},
                            status=status.HTTP_404_NOT_FOUND)
        if test.status == 'completed':
            return Response({'detail': f'"{test.title}" testi yakunlangan — endi yechib bo\'lmaydi.'},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(test).data)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        test = self.get_object()
        attempt, created = start_attempt(test, request.user)
        return Response(attempt_payload(attempt, request), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='export-questions')
    def export_questions(self, request, pk=None):
        test = self.get_object()
        head = ['Savol', 'Tur', 'Ball', 'A', 'B', 'C', 'D', 'E', 'F', "To'g'ri"]
        rows = []
        for q in test.questions.all().prefetch_related('choices'):
            ch = list(q.choices.all())
            right = '; '.join(q.answers) if is_written(q) else ','.join(LETTERS[i] for i, c in enumerate(ch) if c.is_correct)
            rows.append([q.text, 'yozma' if is_written(q) else q.question_type, q.points]
                        + [ch[i].text if i < len(ch) else '' for i in range(6)] + [right])
        return table_response(request.query_params.get('format', 'xlsx'), f'{test.test_code}-savollar',
                              f'{test.title} — savollar', head, rows)

    @action(detail=True, methods=['get'], url_path='export-results')
    def export_results(self, request, pk=None):
        test = self.get_object()
        best = {}
        for a in TestAttempt.objects.filter(test=test, is_completed=True).select_related('student'):
            b = best.get(a.student_id)
            if not b or a.percentage > b.percentage:
                best[a.student_id] = a
        ranked = sorted(best.values(), key=lambda a: (-a.percentage, (a.finished_at - a.started_at).total_seconds()))
        head = ["O'rin", "O'quvchi", 'Ball', 'Foiz', 'Vaqt', 'Urinish', 'Tab', 'Holat', 'Sana']
        rows = []
        for i, a in enumerate(ranked, 1):
            sec = int((a.finished_at - a.started_at).total_seconds())
            rows.append([i, a.student.get_full_name() or a.student.username, f'{a.score}/{a.max_score}',
                         f'{a.percentage}%', f'{sec // 60:02d}:{sec % 60:02d}', a.attempt_number, a.tab_switches,
                         'Majburan topshirilgan' if a.force_submitted else 'OK', a.finished_at.strftime('%d.%m.%Y %H:%M')])
        return table_response(request.query_params.get('format', 'xlsx'), f'{test.test_code}-natijalar',
                              f'{test.title} — natijalar', head, rows)


class BankQuestionViewSet(viewsets.ModelViewSet):
    """Savol banki savollari: /api/bank-questions/?bank=ID"""
    serializer_class = QuestionSerializer
    permission_classes = [IsTeacherOrAdmin]

    def get_queryset(self):
        u = self.request.user
        qs = Question.objects.filter(bank__isnull=False).prefetch_related('choices')
        if u.role != 'admin':
            qs = qs.filter(bank__created_by=u)
        bank = self.request.query_params.get('bank')
        return qs.filter(bank_id=bank) if bank else qs

    def perform_create(self, serializer):
        bank = QuestionBank.objects.filter(pk=self.request.data.get('bank_id')).first()
        if not bank or (self.request.user.role != 'admin' and bank.created_by_id != self.request.user.id):
            raise PermissionDenied('Bank topilmadi yoki sizga tegishli emas')
        serializer.save(bank=bank, test=None)
