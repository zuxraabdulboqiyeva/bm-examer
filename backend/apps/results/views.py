from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import TestAttempt
from .services import (attempt_payload, finalize_if_expired, register_violation, result_payload, save_answer,
                       submit)


class AttemptViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Urinish bilan ishlash:
    GET  /api/attempts/{id}/            — test yechish uchun savollar (javoblarsiz)
    POST /api/attempts/{id}/answer/     — {question_id, value} auto-save (FR-RUN-3)
    POST /api/attempts/{id}/violation/  — {reason} qoidabuzarlik (FR-RUN-4)
    POST /api/attempts/{id}/submit/     — topshirish (FR-RUN-5)
    GET  /api/attempts/{id}/result/     — natija (show_results bo'yicha)
    """
    queryset = TestAttempt.objects.select_related('test', 'student')

    def get_object(self):
        a = super().get_object()
        u = self.request.user
        if u.role == 'student':
            if a.student_id != u.id:
                raise PermissionDenied('Bu urinish sizniki emas')
            if self.action in ('result',) and not a.is_completed:
                finalize_if_expired(a)
        elif u.role == 'teacher':
            if a.test.created_by_id != u.id:
                raise PermissionDenied('Bu test sizga tegishli emas')
            if self.action in ('answer', 'violation', 'submit'):
                raise PermissionDenied("Faqat o'quvchi test yechadi")
        elif self.action in ('answer', 'violation', 'submit'):
            raise PermissionDenied("Faqat o'quvchi test yechadi")
        return a

    def retrieve(self, request, *args, **kwargs):
        a = finalize_if_expired(self.get_object())
        if a.is_completed:
            return Response(result_payload(a, request.user, request))
        return Response(attempt_payload(a, request))

    @action(detail=True, methods=['post'])
    def answer(self, request, pk=None):
        a = save_answer(self.get_object(), request.data.get('question_id'), request.data.get('value', []))
        return Response({'saved': True, 'answers': a.answers})

    @action(detail=True, methods=['post'])
    def violation(self, request, pk=None):
        a, state = register_violation(self.get_object(), request.data.get('reason'))
        return Response({'state': state, 'tab_switches': a.tab_switches, 'is_completed': a.is_completed})

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        a = submit(self.get_object())
        return Response(result_payload(a, request.user, request))

    @action(detail=True, methods=['get'])
    def result(self, request, pk=None):
        a = self.get_object()
        if not a.is_completed:
            return Response({'detail': 'Urinish hali yakunlanmagan'}, status=400)
        return Response(result_payload(a, request.user, request))
