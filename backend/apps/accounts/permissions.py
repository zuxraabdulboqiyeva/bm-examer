from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdmin(BasePermission):
    message = "Bu amal faqat admin uchun."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'admin')


class IsTeacherOrAdmin(BasePermission):
    message = "Bu amal faqat o'qituvchi yoki admin uchun."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in ('teacher', 'admin'))


class IsStudent(BasePermission):
    message = "Bu amal faqat o'quvchi uchun."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'student')


class ReadOnlyOrAdmin(BasePermission):
    """O'qish hamma (kirgan) foydalanuvchiga, yozish faqat adminga (FR-SUBJ-1/2)."""
    message = "Bu amal faqat admin uchun."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or request.user.role == 'admin'
