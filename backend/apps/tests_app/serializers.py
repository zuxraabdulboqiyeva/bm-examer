from rest_framework import serializers

from apps.core.fields import Base64ImageField
from apps.subjects.models import Subject
from .models import Choice, Question, Test
from .services import composition


class ChoiceSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = Choice
        fields = ['id', 'text', 'is_correct']


class QuestionSerializer(serializers.ModelSerializer):
    """To'liq savol (to'g'ri javoblar bilan) — faqat o'qituvchi/admin ko'radi."""
    id = serializers.IntegerField(required=False)
    test_id = serializers.IntegerField(read_only=True)
    bank_id = serializers.IntegerField(read_only=True)
    image = Base64ImageField(required=False, allow_null=True)
    choices = ChoiceSerializer(many=True, required=False)

    class Meta:
        model = Question
        fields = ['id', 'test_id', 'bank_id', 'question_type', 'text', 'image', 'difficulty', 'points', 'order',
                  'answers', 'choices']

    def validate(self, attrs):
        qtype = attrs.get('question_type', getattr(self.instance, 'question_type', 'single'))
        text = (attrs.get('text') or getattr(self.instance, 'text', '') or '').strip()
        if not text:
            raise serializers.ValidationError({'text': 'Savol matnini kiriting'})
        attrs['text'] = text
        if 'points' in attrs and not (attrs['points'] and attrs['points'] > 0):
            raise serializers.ValidationError({'points': "Ball 0 dan katta bo'lishi kerak"})
        if qtype == 'written':
            acc = [str(a).strip() for a in (attrs.get('answers') or []) if str(a).strip()]
            if not acc:
                raise serializers.ValidationError({'answers': "Kamida bitta to'g'ri javobni yozing"})
            attrs['answers'] = acc
            attrs['choices'] = []
        else:
            choices = attrs.get('choices')
            if choices is None and self.instance is not None:
                return attrs
            choices = choices or []
            if len(choices) < 2:
                raise serializers.ValidationError({'choices': 'Kamida 2 ta variant kerak'})
            if any(not (c.get('text') or '').strip() for c in choices):
                raise serializers.ValidationError({'choices': "Bo'sh variantlarni to'ldiring yoki o'chiring"})
            n_right = sum(1 for c in choices if c.get('is_correct'))
            if not n_right:
                raise serializers.ValidationError({'choices': "Kamida bitta to'g'ri javobni belgilang"})
            if qtype in ('single', 'true_false') and n_right != 1:
                raise serializers.ValidationError({'choices': "Bitta javobli savolda faqat bitta to'g'ri javob bo'ladi"})
            attrs['answers'] = []
        return attrs

    def _save_choices(self, q, choices):
        if choices is None:
            return
        keep = []
        for i, c in enumerate(choices):
            obj = q.choices.filter(pk=c.get('id')).first() if c.get('id') else None
            if obj is None:
                obj = Choice(question=q)
            obj.text, obj.is_correct, obj.order = c['text'].strip(), bool(c.get('is_correct')), i
            obj.save()
            keep.append(obj.pk)
        q.choices.exclude(pk__in=keep).delete()

    def create(self, validated):
        choices = validated.pop('choices', [])
        validated.pop('id', None)
        q = Question.objects.create(**validated)
        self._save_choices(q, choices)
        return q

    def update(self, instance, validated):
        choices = validated.pop('choices', None)
        validated.pop('id', None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._save_choices(instance, choices)
        return instance


class StudentChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Choice
        fields = ['id', 'text']


class StudentQuestionSerializer(serializers.ModelSerializer):
    """Test yechish paytida o'quvchiga beriladigan savol — to'g'ri javoblarsiz."""
    image = Base64ImageField(read_only=True)
    choices = StudentChoiceSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = ['id', 'question_type', 'text', 'image', 'points', 'choices']


class TestSerializer(serializers.ModelSerializer):
    subject_id = serializers.PrimaryKeyRelatedField(source='subject', queryset=Subject.objects.all())
    created_by = serializers.IntegerField(source='created_by_id', read_only=True)
    question_count = serializers.SerializerMethodField()
    closed_count = serializers.SerializerMethodField()
    written_count = serializers.SerializerMethodField()
    total_points = serializers.SerializerMethodField()

    class Meta:
        model = Test
        fields = ['id', 'title', 'description', 'subject_id', 'created_by', 'test_code', 'duration_minutes',
                  'difficulty', 'status', 'shuffle_questions', 'shuffle_choices', 'max_attempts', 'show_results',
                  'strict_mode', 'scoring', 'created_at', 'updated_at', 'question_count', 'closed_count',
                  'written_count', 'total_points']
        read_only_fields = ['id', 'status', 'created_at', 'updated_at']

    def _comp(self, obj):
        if not hasattr(obj, '_comp_cache'):
            qs = list(obj.questions.all())
            obj._comp_cache = (composition(qs), round(sum(q.points for q in qs), 1))
        return obj._comp_cache

    def get_question_count(self, obj):
        return self._comp(obj)[0]['total']

    def get_closed_count(self, obj):
        return self._comp(obj)[0]['closed']

    def get_written_count(self, obj):
        return self._comp(obj)[0]['written']

    def get_total_points(self, obj):
        return self._comp(obj)[1]

    def validate_title(self, v):
        v = v.strip()
        if not v:
            raise serializers.ValidationError('Test nomini kiriting')
        return v

    def validate_duration_minutes(self, v):
        if v < 1:
            raise serializers.ValidationError('Kamida 1 daqiqa')
        return v

    def validate_test_code(self, v):
        v = v.strip().upper()
        qs = Test.objects.filter(test_code=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Bu kod band')
        return v
