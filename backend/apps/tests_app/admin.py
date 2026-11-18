from django.contrib import admin

from .models import Choice, Question, Test


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 0


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('text', 'question_type', 'points', 'test', 'bank')
    inlines = [ChoiceInline]


@admin.register(Test)
class TestAdmin(admin.ModelAdmin):
    list_display = ('title', 'subject', 'created_by', 'test_code', 'status', 'scoring')
    list_filter = ('status', 'subject')
