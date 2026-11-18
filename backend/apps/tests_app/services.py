"""Test qoidalari — prototipdagi mantiqning server tomondagi nusxasi.

Muhim: baholash, vaqt va qoidabuzarlik FAQAT serverda hal qilinadi — brauzerga ishonilmaydi.
"""
import random
import re

# Test tarkibi: 20 ta variantli + 10 ta yozma = 30 savol (standart ball tizimida majburiy)
RULE = {'closed': 20, 'written': 10, 'total': 30}
# Ball (jami 50): 1–10 → 1,2; 11–20 → 1,8; 21–30 (yozma) → 2
BLOCK_POINTS = [1.2, 1.8, 2.0]
MAX_WARNINGS = 3


def is_written(q):
    return q.question_type == 'written'


def composition(questions):
    qs = list(questions)
    written = sum(1 for q in qs if is_written(q))
    return {'closed': len(qs) - written, 'written': written, 'total': len(qs)}


def composition_ok(c):
    return c['closed'] == RULE['closed'] and c['written'] == RULE['written']


def composition_text(c):
    return (f"Faollashtirish uchun {RULE['closed']} ta variantli (hozir {c['closed']}) va "
            f"{RULE['written']} ta yozma (hozir {c['written']}) savol kerak")


def points_at(i):
    return BLOCK_POINTS[min(len(BLOCK_POINTS) - 1, i // 10)]


def arrange(test, questions):
    """Tartib va ballarni test ball tizimiga moslab saqlaydi (standart: variantli oldin, yozma oxirida)."""
    qs = list(questions)
    if test.scoring == 'free':
        for i, q in enumerate(qs):
            q.order = i
            if not q.points or q.points <= 0:
                q.points = 1
    else:
        qs = [q for q in qs if not is_written(q)] + [q for q in qs if is_written(q)]
        for i, q in enumerate(qs):
            q.order = i
            q.points = points_at(i)
    return qs


def norm_ans(s):
    """Yozma javobni solishtirish: harf katta-kichikligi, bo'shliq, ё/е, 3,5/3.5 va oxirgi nuqta farq qilmaydi."""
    s = str('' if s is None else s).strip().lower()
    s = re.sub(r'\s+', ' ', s).replace('ё', 'е')
    s = re.sub(r'(\d),(\d)', r'\1.\2', s)
    return re.sub(r'[.!]+$', '', s)


def check_question(q, sel, correct_ids=None):
    """(ok, right) — ko'p javobli savolda faqat to'liq mos kelsa to'g'ri."""
    sel = sel or []
    if is_written(q):
        right = list(q.answers or [])
        ok = bool(sel and norm_ans(sel[0])) and any(norm_ans(x) == norm_ans(sel[0]) for x in right)
        return ok, right
    right = correct_ids if correct_ids is not None else [c.id for c in q.choices.all() if c.is_correct]
    sel_ids = set()
    for x in sel:
        try:
            sel_ids.add(int(x))
        except (TypeError, ValueError):
            pass
    ok = len(sel_ids) == len(right) and sel_ids == set(right)
    return ok, right


def grade(attempt, qmap):
    """Urinishni baholaydi. qmap: {question_id: Question (choices prefetch qilingan)}."""
    score = mx = 0.0
    correct = 0
    per = {}
    for qid in attempt.order:
        q = qmap.get(int(qid))
        if not q:
            continue
        mx += q.points
        sel = (attempt.answers or {}).get(str(qid)) or []
        ok, right = check_question(q, sel)
        if ok:
            score += q.points
            correct += 1
        per[str(qid)] = {'ok': ok, 'earned': q.points if ok else 0, 'sel': sel, 'right': right}
    score, mx = round(score, 1), round(mx, 1)
    return {
        'score': score, 'max_score': mx, 'correct_answers': correct, 'total_questions': len(attempt.order),
        'percentage': round(score / mx * 100, 1) if mx else 0.0, 'per': per,
    }


def build_order(test, questions):
    """Urinish uchun savollar va variantlar tartibi. Standartda faqat har 10 talik ichida aralashadi."""
    qs = list(questions)
    if test.shuffle_questions:
        if test.scoring == 'free':
            random.shuffle(qs)
        else:
            blocks = [qs[i:i + 10] for i in range(0, len(qs), 10)]
            for b in blocks:
                random.shuffle(b)
            qs = [q for b in blocks for q in b]
    order = [q.id for q in qs]
    choice_order = {}
    for q in qs:
        ids = [c.id for c in q.choices.all()]
        if test.shuffle_choices and q.question_type not in ('true_false', 'written'):
            random.shuffle(ids)
        choice_order[str(q.id)] = ids
    return order, choice_order
