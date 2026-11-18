from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.serializers import PublicUserSerializer, UserSerializer
from apps.question_bank.models import QuestionBank
from apps.question_bank.views import QuestionBankSerializer
from apps.results.models import TestAttempt
from apps.results.serializers import AttemptPublicSerializer, AttemptSerializer
from apps.results.services import finalize_if_expired
from apps.subjects.models import Subject
from apps.subjects.serializers import SubjectSerializer
from apps.tests_app.models import Question, Test
from apps.tests_app.serializers import QuestionSerializer, TestSerializer


class BootstrapView(APIView):
    """GET /api/bootstrap/ — joriy foydalanuvchi ko'rishi mumkin bo'lgan barcha ma'lumot bitta so'rovda.

    Frontend shu bilan ekranlarni chizadi. Har bir rol faqat o'ziga ruxsat etilganini oladi:
    - admin: hammasi;
    - o'qituvchi: o'z testlari, savollari, banklari va shu testlardagi urinishlar;
    - o'quvchi: faol/yakunlangan testlar (savollarsiz!), o'z urinishlari va reyting uchun boshqalarning natijalari (javoblarsiz).
    """

    def get(self, request):
        u = request.user
        ctx = {'request': request}
        subjects = SubjectSerializer(Subject.objects.all(), many=True).data

        # Muddati o'tgan ochiq urinishlarni yopib qo'yamiz
        for a in TestAttempt.objects.filter(is_completed=False).select_related('test'):
            finalize_if_expired(a)

        if u.role == 'admin':
            tests = Test.objects.all().prefetch_related('questions')
            return Response({
                'me': UserSerializer(u, context=ctx).data,
                'users': UserSerializer(User.objects.all(), many=True, context=ctx).data,
                'subjects': subjects,
                'banks': QuestionBankSerializer(QuestionBank.objects.all(), many=True).data,
                'tests': TestSerializer(tests, many=True).data,
                'questions': QuestionSerializer(Question.objects.all().prefetch_related('choices'), many=True, context=ctx).data,
                'attempts': AttemptSerializer(TestAttempt.objects.all(), many=True).data,
            })

        if u.role == 'teacher':
            tests = Test.objects.filter(created_by=u).prefetch_related('questions')
            banks = QuestionBank.objects.filter(created_by=u)
            questions = Question.objects.filter(test__created_by=u) | Question.objects.filter(bank__created_by=u)
            students = User.objects.filter(role='student')
            others = User.objects.exclude(role='student')
            return Response({
                'me': UserSerializer(u, context=ctx).data,
                'users': UserSerializer(students, many=True, context=ctx).data + PublicUserSerializer(others, many=True, context=ctx).data,
                'subjects': subjects,
                'banks': QuestionBankSerializer(banks, many=True).data,
                'tests': TestSerializer(tests, many=True).data,
                'questions': QuestionSerializer(questions.distinct().prefetch_related('choices'), many=True, context=ctx).data,
                'attempts': AttemptSerializer(TestAttempt.objects.filter(test__created_by=u), many=True).data,
            })

        # o'quvchi
        tests = Test.objects.filter(status__in=['active', 'completed']).prefetch_related('questions')
        own = TestAttempt.objects.filter(student=u)
        others = TestAttempt.objects.filter(is_completed=True, test__in=tests).exclude(student=u)
        return Response({
            'me': UserSerializer(u, context=ctx).data,
            'users': [UserSerializer(u, context=ctx).data] + PublicUserSerializer(User.objects.exclude(pk=u.pk), many=True, context=ctx).data,
            'subjects': subjects,
            'banks': [],
            'tests': TestSerializer(tests, many=True).data,
            'questions': [],
            'attempts': AttemptSerializer(own, many=True).data + AttemptPublicSerializer(others, many=True).data,
        })
