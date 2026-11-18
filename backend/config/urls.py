from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import ChangePasswordView, LoginView, ProfileView, RegisterView, UserViewSet
from apps.core.views import BootstrapView
from apps.question_bank.views import QuestionBankViewSet
from apps.results.views import AttemptViewSet
from apps.subjects.views import SubjectViewSet
from apps.tests_app.views import BankQuestionViewSet, TestViewSet

router = DefaultRouter()
router.register('users', UserViewSet, basename='user')
router.register('subjects', SubjectViewSet, basename='subject')
router.register('tests', TestViewSet, basename='test')
router.register('question-banks', QuestionBankViewSet, basename='bank')
router.register('bank-questions', BankQuestionViewSet, basename='bank-question')
router.register('attempts', AttemptViewSet, basename='attempt')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/login/', LoginView.as_view()),
    path('api/auth/refresh/', TokenRefreshView.as_view()),
    path('api/auth/register/', RegisterView.as_view()),
    path('api/auth/profile/', ProfileView.as_view()),
    path('api/auth/change-password/', ChangePasswordView.as_view()),
    path('api/bootstrap/', BootstrapView.as_view()),
    path('api/', include(router.urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
