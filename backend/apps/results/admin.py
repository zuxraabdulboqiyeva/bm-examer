from django.contrib import admin

from .models import TestAttempt


@admin.register(TestAttempt)
class TestAttemptAdmin(admin.ModelAdmin):
    list_display = ('student', 'test', 'attempt_number', 'score', 'percentage', 'is_completed', 'tab_switches', 'force_submitted')
    list_filter = ('is_completed', 'force_submitted', 'test')
