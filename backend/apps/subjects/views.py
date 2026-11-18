from rest_framework import status, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import ReadOnlyOrAdmin
from .models import Subject
from .serializers import SubjectSerializer


class SubjectViewSet(viewsets.ModelViewSet):
    """Fanlar: hamma ko'radi, faqat admin o'zgartiradi (foydalanuvchi qarori: o'qituvchi emas)."""
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [ReadOnlyOrAdmin]

    def destroy(self, request, *args, **kwargs):
        subject = self.get_object()
        n = subject.tests.count()
        if n:
            return Response({'detail': f'"{subject.name}" faniga {n} ta test biriktirilgan. Avval ularni boshqa fanga '
                                       f"o'tkazing yoki o'chiring."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)
