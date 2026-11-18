from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class BMUserAdmin(UserAdmin):
    list_display = ('username', 'first_name', 'last_name', 'role', 'phone', 'is_active')
    list_filter = ('role', 'is_active')
    fieldsets = UserAdmin.fieldsets + (("BM Examer", {'fields': ('role', 'phone', 'avatar')}),)
