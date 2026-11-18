from django.conf import settings
from django.db import models


class QuestionBank(models.Model):
    """Qayta ishlatiladigan savollar to'plami. Savollar tests_app.Question da (bank FK bilan) saqlanadi."""
    name = models.CharField(max_length=150)
    subject = models.ForeignKey('subjects.Subject', on_delete=models.CASCADE, related_name='banks')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='banks')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name
