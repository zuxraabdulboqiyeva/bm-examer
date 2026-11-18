import re
import secrets

from django.contrib.auth import password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.core.fields import Base64ImageField
from .models import User

USERNAME_RE = re.compile(r'^[a-z0-9_.]{3,}$', re.I)
PASS_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'


def gen_password(n=8):
    return ''.join(secrets.choice(PASS_ALPHABET) for _ in range(n))


class UserSerializer(serializers.ModelSerializer):
    """To'liq ma'lumot (admin va foydalanuvchining o'zi uchun). Parol hech qachon qaytarilmaydi."""
    avatar = Base64ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'phone', 'avatar', 'created_at']
        read_only_fields = ['id', 'username', 'created_at']


class PublicUserSerializer(serializers.ModelSerializer):
    """Boshqa foydalanuvchilar ko'radigan qism (reyting, o'qituvchi ismi)."""
    avatar = Base64ImageField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'role', 'avatar', 'created_at']


class ProfileSerializer(UserSerializer):
    class Meta(UserSerializer.Meta):
        read_only_fields = ['id', 'username', 'role', 'created_at']


class AdminUserSerializer(UserSerializer):
    """Admin foydalanuvchini tahrirlaydi/qo'shadi. Parol faqat yaratishda (yoki bo'sh bo'lsa avtomatik)."""
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ['password']
        read_only_fields = ['id', 'created_at']

    def validate_username(self, v):
        v = v.strip()
        if not USERNAME_RE.match(v):
            raise serializers.ValidationError('Kamida 3 ta belgi: harf, raqam, _ yoki .')
        qs = User.objects.filter(username__iexact=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Bu login band')
        return v

    def create(self, validated):
        password = validated.pop('password', '') or gen_password()
        user = User(**validated)
        user.set_password(password)
        user.save()
        user._plain_password = password  # javobda bir marta ko'rsatish uchun
        return user

    def update(self, instance, validated):
        validated.pop('password', None)
        request = self.context.get('request')
        if request and instance.pk == request.user.pk and validated.get('role', instance.role) != instance.role:
            raise serializers.ValidationError({'role': "O'z rolingizni o'zgartira olmaysiz"})
        return super().update(instance, validated)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=[('student', "O'quvchi"), ('teacher', "O'qituvchi")], default='student')

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'phone', 'role', 'password', 'password2']
        extra_kwargs = {'first_name': {'required': True}, 'last_name': {'required': True}, 'email': {'required': True}}

    def validate_username(self, v):
        v = v.strip()
        if not USERNAME_RE.match(v):
            raise serializers.ValidationError('Kamida 3 ta belgi: harf, raqam, _ yoki .')
        if User.objects.filter(username__iexact=v).exists():
            raise serializers.ValidationError('Bu login band — boshqasini tanlang')
        return v

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password2': 'Parollar mos kelmadi'})
        password_validation.validate_password(attrs['password'])
        return attrs

    def create(self, validated):
        password = validated.pop('password')
        user = User(**validated)
        user.set_password(password)
        user.save()
        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=6)

    def validate_old_password(self, v):
        if not self.context['request'].user.check_password(v):
            raise serializers.ValidationError("Joriy parol noto'g'ri")
        return v


class LoginSerializer(TokenObtainPairSerializer):
    """JWT bilan birga foydalanuvchi ma'lumotini ham qaytaradi."""
    default_error_messages = {'no_active_account': "Login yoki parol noto'g'ri"}

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user, context=self.context).data
        return data
