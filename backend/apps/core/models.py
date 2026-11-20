from django.db import models


class StoredFile(models.Model):
    """Yuklangan rasm (avatar, savol rasmi) ma'lumotlar bazasida saqlanadi.

    Nega: bepul hostinglarda (Render) server diski har qayta ishga tushganda tozalanadi,
    baza esa saqlanib qoladi. Shuning uchun rasmlar ham bazada turadi.
    """
    name = models.CharField(max_length=255, unique=True)
    content = models.BinaryField()
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
