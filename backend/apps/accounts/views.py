from django.db import transaction
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.core.exports import table_response
from .models import User
from .permissions import IsAdmin
from .serializers import (AdminUserSerializer, ChangePasswordSerializer, LoginSerializer, ProfileSerializer,
                          RegisterSerializer, UserSerializer)


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ {username, password} → {access, refresh, user}"""
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ — ro'yxatdan o'tish (o'quvchi yoki o'qituvchi), darhol tizimga kiritadi."""
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        return Response({**tokens_for(user), 'user': UserSerializer(user, context={'request': request}).data},
                        status=status.HTTP_201_CREATED)


class ProfileView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/auth/profile/ — o'z profilini ko'rish va tahrirlash."""
    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = ChangePasswordSerializer(data=request.data, context={'request': request})
        s.is_valid(raise_exception=True)
        request.user.set_password(s.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        return Response({'detail': "Parol o'zgartirildi"})


class UserViewSet(viewsets.ModelViewSet):
    """Admin: foydalanuvchilar CRUD, ko'p qo'shish va eksport (3.8)."""
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdmin]
    queryset = User.objects.all()
    filterset_fields = ['role']

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get('search')
        if q:
            from django.db.models import Q
            qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(username__icontains=q)
                           | Q(email__icontains=q) | Q(phone__icontains=q))
        return qs

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        data = self.get_serializer(user).data
        data['password'] = user._plain_password
        return Response(data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().pk == request.user.pk:
            return Response({'detail': "O'zingizni o'chira olmaysiz"}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """POST /api/users/bulk/ {users:[{first_name,last_name,username?,password?,role,phone,email}]}
        Hammasi yoki hech biri: bitta xato bo'lsa, hech kim qo'shilmaydi va xatolar qatorma-qator qaytadi."""
        items = request.data.get('users') or []
        if not isinstance(items, list) or not items:
            return Response({'detail': "Ro'yxat bo'sh"}, status=status.HTTP_400_BAD_REQUEST)
        errors, created = {}, []
        with transaction.atomic():
            for i, item in enumerate(items):
                s = AdminUserSerializer(data=item, context={'request': request})
                if s.is_valid():
                    u = s.save()
                    row = AdminUserSerializer(u, context={'request': request}).data
                    row['password'] = u._plain_password
                    created.append(row)
                else:
                    errors[i] = s.errors
            if errors:
                transaction.set_rollback(True)
                return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'created': created}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """GET /api/users/export/?format=xlsx|docx|pdf (parollarsiz)"""
        role_names = dict(User.Role.choices)
        rows = [[u.first_name, u.last_name, role_names.get(u.role, u.role), u.username, u.phone, u.email,
                 u.created_at.strftime('%d.%m.%Y')] for u in self.filter_queryset(self.get_queryset())]
        head = ['Ism', 'Familiya', 'Rol', 'Login', 'Telefon', 'Email', "Qo'shilgan"]
        return table_response(request.query_params.get('format', 'xlsx'), 'foydalanuvchilar', 'Foydalanuvchilar', head, rows)
