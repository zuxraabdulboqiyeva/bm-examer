from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path
from django.views.static import serve
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import ChangePasswordView, LoginView, ProfileView, RegisterView, UserViewSet
from apps.core.views import BootstrapView
from apps.question_bank.views import QuestionBankViewSet
from apps.results.views import AttemptViewSet
from apps.subjects.views import SubjectViewSet
from apps.tests_app.views import BankQuestionViewSet, TestViewSet

def spa(request):
    index = settings.FRONTEND_DIST / 'index.html'
    if not index.exists():
        raise Http404('Frontend build topilmadi: frontend papkasida "npm run build" ni ishga tushiring')
    return FileResponse(open(index, 'rb'), content_type='text/html')


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
    # Yuklangan rasmlar (savol rasmlari, avatarlar)
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    # Qolgan barcha manzillar — React sayt (sahifani yangilaganda ham ishlaydi)
    re_path(r'^(?!api/|admin/|media/|static/).*$', spa),
]
