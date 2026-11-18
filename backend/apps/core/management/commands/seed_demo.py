"""Demo ma'lumotlar: `python manage.py seed_demo [--reset]`

Prototipdagi demo bilan bir xil: admin/admin123, dilnoza/teacher123, aziz/student123 va boshqalar.
"""
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.question_bank.models import QuestionBank
from apps.results.models import TestAttempt
from apps.subjects.models import Subject
from apps.tests_app.models import Choice, Question, Test
from apps.tests_app.services import RULE, arrange, build_order, composition, grade

POOL = {
    'verbs': [['go', 'went', 'gone'], ['take', 'took', 'taken'], ['see', 'saw', 'seen'], ['write', 'wrote', 'written'],
              ['eat', 'ate', 'eaten'], ['give', 'gave', 'given'], ['speak', 'spoke', 'spoken'], ['buy', 'bought', 'bought'],
              ['bring', 'brought', 'brought'], ['drink', 'drank', 'drunk'], ['begin', 'began', 'begun'],
              ['choose', 'chose', 'chosen'], ['forget', 'forgot', 'forgotten'], ['know', 'knew', 'known'],
              ['drive', 'drove', 'driven'], ['fly', 'flew', 'flown'], ['swim', 'swam', 'swum'], ['sing', 'sang', 'sung'],
              ['break', 'broke', 'broken'], ['wear', 'wore', 'worn'], ['teach', 'taught', 'taught'],
              ['think', 'thought', 'thought'], ['catch', 'caught', 'caught'], ['find', 'found', 'found'],
              ['leave', 'left', 'left'], ['make', 'made', 'made'], ['run', 'ran', 'run'], ['come', 'came', 'come'],
              ['steal', 'stole', 'stolen'], ['ride', 'rode', 'ridden']],
    'en': [['kitob', 'book'], ['olma', 'apple'], ['uy', 'house'], ['maktab', 'school'], ["do'st", 'friend'],
           ['suv', 'water'], ['it', 'dog'], ['mushuk', 'cat'], ['qalam', 'pen'], ['oy', 'moon'], ['quyosh', 'sun'],
           ['daraxt', 'tree'], ['shahar', 'city'], ['non', 'bread'], ['deraza', 'window'], ['eshik', 'door'],
           ['stol', 'table'], ['gul', 'flower']],
    'ant': [['высокий', 'низкий'], ['день', 'ночь'], ['начало', 'конец'], ['тёплый', 'холодный'],
            ['большой', 'маленький'], ['лёгкий', 'тяжёлый'], ['быстрый', 'медленный'], ['старый', 'новый'],
            ['добрый', 'злой'], ['весёлый', 'грустный'], ['громкий', 'тихий'], ['сухой', 'мокрый'],
            ['богатый', 'бедный'], ['правда', 'ложь'], ['друг', 'враг'], ['вверх', 'вниз'], ['открыть', 'закрыть'],
            ['сильный', 'слабый'], ['широкий', 'узкий'], ['светлый', 'тёмный']],
    'plur': [['стол', 'столы'], ['книга', 'книги'], ['окно', 'окна'], ['ребёнок', 'дети'], ['человек', 'люди'],
             ['дом', 'дома'], ['город', 'города'], ['глаз', 'глаза'], ['друг', 'друзья'], ['стул', 'стулья'],
             ['лист', 'листья'], ['брат', 'братья']],
    'ru': [['kitob', 'книга'], ['uy', 'дом'], ['suv', 'вода'], ['maktab', 'школа'], ['ona', 'мать'], ['ota', 'отец'],
           ['olma', 'яблоко'], ['non', 'хлеб'], ['shahar', 'город'], ['daraxt', 'дерево'], ['qalam', 'ручка'],
           ['gul', 'цветок']],
}


def choice(rnd, correct, wrongs):
    w = []
    for x in map(str, wrongs):
        if x != str(correct) and x not in w:
            w.append(x)
    opts = [(str(correct), True)] + [(x, False) for x in w[:3]]
    rnd.shuffle(opts)
    return opts


def fill_questions(subject_key, need_closed, need_written, rnd):
    """Fan bo'yicha variantli va yozma savollar generatori (prototipdagi bilan bir xil g'oya)."""
    closed, written, seen = [], [], set()

    def push(lst, d):
        if d[1] not in seen:
            seen.add(d[1])
            lst.append(d)

    guard = 0
    while (len(closed) < need_closed or len(written) < need_written) and guard < 3000:
        guard += 1
        want_c, want_w = len(closed) < need_closed, len(written) < need_written
        if subject_key == 'math':
            if want_c and (rnd.random() < .4 or not want_w):
                k = rnd.randint(0, 3)
                if k == 0:
                    a, b = rnd.randint(6, 19), rnd.randint(3, 12)
                    push(closed, ('single', f'${a} \\cdot {b}$ ni hisoblang.', choice(rnd, a * b, [a * b + a, a * b - b, a * b + 10, a * b - 1])))
                elif k == 1:
                    x, a, b = rnd.randint(2, 15), rnd.randint(2, 9), rnd.randint(1, 20)
                    push(closed, ('single', f"${a}x + {b} = {a * x + b}$ bo'lsa, $x$ nechaga teng?", choice(rnd, x, [x + 1, x - 1, x + 2, x * 2])))
                elif k == 2:
                    n, p = rnd.randint(2, 20) * 20, rnd.choice([5, 10, 15, 20, 25, 30, 50])
                    v = n * p // 100 if n * p % 100 == 0 else n * p / 100
                    push(closed, ('single', f'${n}$ ning ${p}\\%$ i nechaga teng?', choice(rnd, v, [v * 2, v + 5, v / 2, v + 10])))
                else:
                    m = rnd.randint(11, 25)
                    push(closed, ('single', f'${m}^2$ nechaga teng?', choice(rnd, m * m, [m * m + m, m * m - 1, m * 2, m * m + 10])))
            elif want_w:
                k = rnd.randint(0, 3)
                if k == 0:
                    x, a, b = rnd.randint(2, 14), rnd.randint(2, 8), rnd.randint(1, 15)
                    push(written, ('written', f'${a}x - {b} = {a * x - b}$ tenglamani yeching. $x$ ning qiymatini yozing.', [str(x)]))
                elif k == 1:
                    m = rnd.randint(12, 30)
                    push(written, ('written', f'$\\sqrt{{{m * m}}}$ ni hisoblang.', [str(m)]))
                elif k == 2:
                    n, p = rnd.randint(3, 30) * 10, rnd.choice([10, 20, 30, 40, 60, 75])
                    v = n * p / 100
                    push(written, ('written', f'${n}$ sonining ${p}\\%$ ini toping.', [str(int(v)) if v == int(v) else str(v)]))
                else:
                    a1, d, n = rnd.randint(1, 9), rnd.randint(2, 7), rnd.randint(8, 15)
                    push(written, ('written', f'Arifmetik progressiya: ${a1}, {a1 + d}, {a1 + 2 * d}, \\ldots$ Uning {n}-hadini toping.', [str(a1 + (n - 1) * d)]))
        elif subject_key == 'en':
            v, t = rnd.choice(POOL['verbs']), rnd.choice(POOL['en'])
            others = [x for x in POOL['verbs'] if x is not v]
            if want_c and (rnd.random() < .6 or not want_w):
                k = rnd.randint(0, 2)
                if k == 0:
                    push(closed, ('single', f'What is the past participle (V3) of «{v[0]}»?', choice(rnd, v[2], [v[1], v[0] + 'ed', rnd.choice(others)[2], rnd.choice(others)[2]])))
                elif k == 1:
                    push(closed, ('single', f'Choose the past simple (V2) of «{v[0]}».', choice(rnd, v[1], [v[2], v[0] + 'ed', rnd.choice(others)[1], rnd.choice(others)[1]])))
                else:
                    push(closed, ('single', f"«{t[0]}» so'zining inglizcha tarjimasi:", choice(rnd, t[1], [x[1] for x in rnd.sample([y for y in POOL['en'] if y is not t], 4)])))
            elif want_w:
                k = rnd.randint(0, 2)
                if k == 0:
                    push(written, ('written', f'Write the past simple (V2) of «{v[0]}».', [v[1]]))
                elif k == 1:
                    push(written, ('written', f'Write the past participle (V3) of «{v[0]}».', [v[2]]))
                else:
                    push(written, ('written', f"«{t[0]}» so'zini ingliz tiliga tarjima qiling.", [t[1]]))
        else:
            an, pl, tr = rnd.choice(POOL['ant']), rnd.choice(POOL['plur']), rnd.choice(POOL['ru'])
            if want_c and (rnd.random() < .6 or not want_w):
                k = rnd.randint(0, 2)
                if k == 0:
                    push(closed, ('single', f'Антоним к слову «{an[0]}»:', choice(rnd, an[1], [x[1] for x in rnd.sample([y for y in POOL['ant'] if y is not an], 4)])))
                elif k == 1:
                    push(closed, ('single', f'Множественное число слова «{pl[0]}»:', choice(rnd, pl[1], [pl[0] + 'и', pl[0] + 'ы', pl[0] + 'а', pl[0] + 'ов'])))
                else:
                    push(closed, ('single', f"«{tr[0]}» so'zining ruscha tarjimasi:", choice(rnd, tr[1], [x[1] for x in rnd.sample([y for y in POOL['ru'] if y is not tr], 4)])))
            elif want_w:
                k = rnd.randint(0, 2)
                if k == 0:
                    push(written, ('written', f'Напишите антоним к слову «{an[0]}».', [an[1]]))
                elif k == 1:
                    push(written, ('written', f'Напишите множественное число слова «{pl[0]}».', [pl[1]]))
                else:
                    push(written, ('written', f"«{tr[0]}» so'zini rus tiliga tarjima qiling.", [tr[1]]))
    return closed + written


def add_question(test=None, bank=None, qtype='single', text='', opts=None, order=0, difficulty='medium', points=1):
    q = Question.objects.create(test=test, bank=bank, question_type=qtype, text=text, order=order, difficulty=difficulty,
                                points=points, answers=list(opts) if qtype == 'written' else [])
    if qtype == 'true_false':
        Choice.objects.create(question=q, text='Rost', is_correct=bool(opts), order=0)
        Choice.objects.create(question=q, text="Yolg'on", is_correct=not opts, order=1)
    elif qtype != 'written':
        for i, (t, ok) in enumerate(opts):
            Choice.objects.create(question=q, text=t, is_correct=ok, order=i)
    return q


def C(*items):
    """('5', 1), ('-5',) ko'rinishidagi variantlar → [(text, is_correct)]"""
    return [(x[0], bool(x[1]) if len(x) > 1 else False) for x in items]


class Command(BaseCommand):
    help = "Demo ma'lumotlarni yaratadi (prototip bilan bir xil)"

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help="Mavjud ma'lumotlarni o'chirib, qaytadan yaratadi")

    @transaction.atomic
    def handle(self, *args, **opts):
        if opts['reset']:
            TestAttempt.objects.all().delete()
            Question.objects.all().delete()
            Test.objects.all().delete()
            QuestionBank.objects.all().delete()
            Subject.objects.all().delete()
            User.objects.all().delete()
        elif User.objects.exists():
            self.stdout.write(self.style.WARNING("Ma'lumotlar allaqachon bor. Qaytadan yaratish uchun: seed_demo --reset"))
            return

        rnd = random.Random(20261019)
        now = timezone.now()

        def ago(days, hours=0):
            return now - timedelta(days=days, hours=hours)

        def mk_user(username, password, first, last, role, phone='', email=''):
            u = User(username=username, first_name=first, last_name=last, role=role, phone=phone, email=email,
                     is_staff=(role == 'admin'), is_superuser=(role == 'admin'))
            u.set_password(password)
            u.save()
            return u

        admin = mk_user('admin', 'admin123', 'Bekzod', 'Alimov', 'admin', '+998 90 111 22 33', 'admin@bmexamer.uz')
        dilnoza = mk_user('dilnoza', 'teacher123', 'Dilnoza', 'Rahimova', 'teacher', '+998 91 234 56 78', 'd.rahimova@bmexamer.uz')
        sardor = mk_user('sardor', 'teacher123', 'Sardor', 'Tursunov', 'teacher', '+998 93 345 67 89', 's.tursunov@bmexamer.uz')
        malika = mk_user('malika', 'teacher123', 'Malika', 'Yusupova', 'teacher', '+998 94 456 78 90', 'm.yusupova@bmexamer.uz')
        names = [('Aziz', 'Qodirov'), ('Madina', 'Ergasheva'), ('Jasur', 'Nematov'), ('Nilufar', 'Saidova'),
                 ('Otabek', 'Xolmatov'), ('Sevara', 'Mirzayeva'), ('Shohruh', 'Abdullayev'), ('Kamola', 'Ismoilova'),
                 ('Bobur', 'Rashidov'), ('Gulnoza', 'Tojiyeva'), ('Islombek', 'Sharipov'), ('Dilshod', 'Hamidov')]
        students = []
        for i, (f, l) in enumerate(names):
            uname = 'aziz' if i == 0 else f'{f.lower()}{i + 1}'
            students.append(mk_user(uname, 'student123', f, l, 'student', f'+998 9{i % 10} {300 + i * 7} {10 + i} {20 + i}',
                                    f'{f.lower()}.{l.lower()}@mail.uz'))
        skill = dict(zip([s.id for s in students], [0.82, 0.9, 0.62, 0.95, 0.55, 0.78, 0.48, 0.86, 0.7, 0.66, 0.58, 0.74]))

        math = Subject.objects.create(name='Matematika', description='Algebra, geometriya va trigonometriya', icon='Σ', color='#5b7cff')
        rus = Subject.objects.create(name='Rus tili', description="Grammatika, imlo va lug'at", icon='Ру', color='#d94f5c')
        eng = Subject.objects.create(name='Ingliz tili', description="Grammatika va lug'at", icon='En', color='#2fb7c9')
        key = {math.id: 'math', rus.id: 'ru', eng.id: 'en'}

        def mk_test(title, desc, subject, teacher, code, dur, diff, status, shq=True, shc=True, max_att=2, show='detailed'):
            return Test.objects.create(title=title, description=desc, subject=subject, created_by=teacher, test_code=code,
                                       duration_minutes=dur, difficulty=diff, status=status, shuffle_questions=shq,
                                       shuffle_choices=shc, max_attempts=max_att, show_results=show)

        t1 = mk_test('Algebra: kvadrat tenglamalar', "Diskriminant, Viyet teoremasi va ildizlarni topish.", math, dilnoza, 'BM-7KQ2XD', 40, 'medium', 'active')
        t2 = mk_test('Trigonometriya asoslari', 'Asosiy ayniyatlar va burchak qiymatlari.', math, dilnoza, 'BM-T4R9MA', 40, 'hard', 'completed', shc=False, max_att=1, show='correct_answers')
        t3 = mk_test('Падежи: kelishiklar', "Ot kelishiklari va ularning so'roqlari.", rus, sardor, 'BM-PAD3ZH', 40, 'medium', 'active', shq=False, max_att=0, show='score_only')
        t4 = mk_test("Fe'l zamonlari (время глагола)", "O'tgan, hozirgi va kelasi zamon shakllari.", rus, sardor, 'BM-VR3MYA', 20, 'easy', 'draft', max_att=1)
        t5 = mk_test('Present Perfect Tense', "Have/has + V3: qoidalar va qo'llanish.", eng, malika, 'BM-PRF3CT', 40, 'easy', 'active', max_att=3)
        t6 = mk_test("Антонимы: zid ma'noli so'zlar", 'Rus tilidagi antonim juftliklari.', rus, sardor, 'BM-ANT0NM', 40, 'hard', 'completed', shq=False, shc=False, max_att=1, show='correct_answers')
        extra = [
            ('Logarifmlar va ularning xossalari', math, dilnoza, 'BM-L0G4RX', 'active'),
            ('Geometriya: uchburchaklar', math, dilnoza, 'BM-TR1ANG', 'draft'),
            ('Орфография: imlo qoidalari', rus, sardor, 'BM-0RF0GR', 'active'),
            ('Irregular Verbs', eng, malika, 'BM-1RREGV', 'active'),
            ('Past Simple vs Present Perfect', eng, malika, 'BM-PSVPP2', 'completed'),
            ("Синонимы: ma'nodosh so'zlar", rus, sardor, 'BM-S1N0NM', 'active'),
            ('Articles: a, an, the', eng, malika, 'BM-ART1CL', 'draft'),
            ('Foizlar va proporsiyalar', math, dilnoza, 'BM-F01ZLR', 'active'),
        ]
        extra_tests = [mk_test(t, '', s, tch, code, 40, 'medium', st) for t, s, tch, code, st in extra]

        # Qo'lda yozilgan savollar
        hand = {
            t1: [('single', "$x^2 - 5x + 6 = 0$ tenglama ildizlarining yig'indisini toping.", C(('5', 1), ('-5',), ('6',), ('1',))),
                 ('single', 'Kvadrat tenglama diskriminanti qaysi formula bilan hisoblanadi?', C(('$D = b^2 - 4ac$', 1), ('$D = b^2 + 4ac$',), ('$D = 4ac - b^2$',), ('$D = b - 4ac$',))),
                 ('multiple', 'Qaysi tenglamalar haqiqiy ildizga ega?', C(('$x^2 + 1 = 0$',), ('$x^2 - 4 = 0$', 1), ('$x^2 - 2x + 1 = 0$', 1), ('$x^2 + x + 5 = 0$',))),
                 ('true_false', "Agar $D < 0$ bo'lsa, kvadrat tenglama haqiqiy ildizga ega emas.", True),
                 ('single', "Viyet teoremasiga ko'ra $ax^2 + bx + c = 0$ uchun $x_1 \\cdot x_2$ nimaga teng?", C(('$\\frac{c}{a}$', 1), ('$-\\frac{b}{a}$',), ('$\\frac{b}{a}$',), ('$\\frac{a}{c}$',)))],
            t2: [('single', '$\\sin^2\\alpha + \\cos^2\\alpha$ ifodaning qiymati?', C(('1', 1), ('0',), ('2',), ('$\\tan\\alpha$',))),
                 ('single', '$\\sin 30^\\circ$ ning qiymati?', C(('$\\frac{1}{2}$', 1), ('$\\frac{\\sqrt{3}}{2}$',), ('1',), ('$\\frac{\\sqrt{2}}{2}$',))),
                 ('multiple', 'Qaysi funksiyalar toq funksiya?', C(('$\\sin x$', 1), ('$\\cos x$',), ('$\\tan x$', 1), ('$x^2$',)))],
            t3: [('single', 'В каком падеже стоит слово «книгу» в предложении «Я читаю книгу»?', C(('Винительный', 1), ('Родительный',), ('Дательный',), ('Творительный',))),
                 ('single', 'Сколько падежей в русском языке?', C(('6', 1), ('5',), ('7',), ('8',))),
                 ('multiple', 'Какие вопросы относятся к родительному падежу?', C(('кого?', 1), ('чего?', 1), ('кому?',), ('чем?',)))],
            t4: [('single', 'Глагол «писал» стоит в ___ времени.', C(('прошедшем', 1), ('настоящем',), ('будущем',))),
                 ('true_false', 'Глагол «прочитать» — совершенного вида.', True)],
            t5: [('single', 'She ___ already finished her homework.', C(('has', 1), ('have',), ('is',), ('did',))),
                 ('single', 'They ___ never been to London.', C(('have', 1), ('has',), ('are',), ('were',))),
                 ('multiple', 'Qaysi gaplar Present Perfect zamonida?', C(('I have seen this film.', 1), ('She has gone home.', 1), ('We went to school.',), ('He is reading.',)))],
            t6: [('single', 'Антоним к слову «высокий»:', C(('низкий', 1), ('большой',), ('длинный',), ('широкий',))),
                 ('multiple', 'Какие пары являются антонимами?', C(('добрый — злой', 1), ('вход — выход', 1), ('дом — здание',), ('смелый — храбрый',)))],
        }
        for t, items in hand.items():
            for i, (qt, text, o) in enumerate(items):
                add_question(test=t, qtype=qt, text=text, opts=o, order=i)

        # Faol va yakunlangan testlar 20 + 10 savolgacha to'ldiriladi
        for t in [t1, t2, t3, t5, t6] + extra_tests:
            if t.status == 'draft':
                if not t.questions.exists():
                    for i, d in enumerate(fill_questions(key[t.subject_id], 2, 1, rnd)):
                        add_question(test=t, qtype=d[0], text=d[1], opts=d[2], order=i)
                continue
            c = composition(t.questions.all())
            for i, d in enumerate(fill_questions(key[t.subject_id], RULE['closed'] - c['closed'], RULE['written'] - c['written'], rnd)):
                add_question(test=t, qtype=d[0], text=d[1], opts=d[2], order=c['total'] + i)
        for t in Test.objects.all():
            for q in arrange(t, t.questions.all()):
                q.save(update_fields=['order', 'points'])

        # Savol banklari
        b1 = QuestionBank.objects.create(name='Algebra bazasi', subject=math, created_by=dilnoza)
        b2 = QuestionBank.objects.create(name='Rus tili — grammatika', subject=rus, created_by=sardor)
        for i, (qt, text, o) in enumerate([('single', '$(a+b)^2$ ifodani yoying.', C(('$a^2 + 2ab + b^2$', 1), ('$a^2 + b^2$',), ('$a^2 - 2ab + b^2$',), ('$2a + 2b$',))),
                                            ('single', '$\\sqrt{144}$ nechaga teng?', C(('12', 1), ('14',), ('72',), ('11',))),
                                            ('true_false', '$a^0 = 1$ (bunda $a \\neq 0$).', True)]):
            add_question(bank=b1, qtype=qt, text=text, opts=o, order=i)
        for i, (qt, text, o) in enumerate([('single', 'Множественное число слова «ребёнок»:', C(('дети', 1), ('ребёнки',), ('ребята',), ('детей',))),
                                            ('true_false', 'Слово «кофе» — мужского рода.', True)]):
            add_question(bank=b2, qtype=qt, text=text, opts=o, order=i)

        # Namuna urinishlar (aziz 1-testni hali yechmagan — sinab ko'rish uchun)
        plan = [(t1, 8, True, (1, 9)), (t2, 11, False, (19, 26)), (t3, 9, False, (1, 8)), (t5, 10, False, (2, 13)), (t6, 10, False, (17, 24))]
        n_att = 0
        for test, n, skip_aziz, days in plan:
            qs = list(test.questions.all().prefetch_related('choices'))
            qmap = {q.id: q for q in qs}
            rest = [s for s in students if s.username != 'aziz']
            rnd.shuffle(rest)
            pool = (rest if skip_aziz else [students[0]] + rest)[:n]
            for s in pool:
                tries = 1 if test.max_attempts == 1 else (2 if rnd.random() < .3 else 1)
                for k in range(1, tries + 1):
                    order, choice_order = build_order(test, qs)
                    sk = min(.98, skill[s.id] + (k - 1) * .08)
                    answers = {}
                    for q in qs:
                        if q.question_type == 'written':
                            answers[str(q.id)] = [q.answers[0] if rnd.random() < sk - .08 else ('' if rnd.random() < .5 else 'bilmayman')]
                            continue
                        right = [c.id for c in q.choices.all() if c.is_correct]
                        wrong = [c.id for c in q.choices.all() if not c.is_correct]
                        if rnd.random() < sk:
                            answers[str(q.id)] = right
                        elif q.question_type == 'multiple':
                            answers[str(q.id)] = [right[0], rnd.choice(wrong)]
                        else:
                            answers[str(q.id)] = [rnd.choice(wrong)]
                    started = now - timedelta(days=days[0] + rnd.random() * (days[1] - days[0])) + timedelta(hours=k - 1)
                    spent = test.duration_minutes * 60 * (.35 + rnd.random() * .55)
                    a = TestAttempt(test=test, student=s, attempt_number=k, started_at=started,
                                    finished_at=started + timedelta(seconds=spent), is_completed=True, order=order,
                                    choice_order=choice_order, answers=answers,
                                    tab_switches=(1 + int(rnd.random() * 3)) if rnd.random() < .22 else 0)
                    g = grade(a, qmap)
                    g.pop('per')
                    for f, v in g.items():
                        setattr(a, f, v)
                    a.save()
                    n_att += 1

        # Yaratilgan vaqtlarni realistik qilish
        for i, t in enumerate(Test.objects.all()):
            Test.objects.filter(pk=t.pk).update(created_at=ago(30 - i), updated_at=ago(14 - i % 10))

        self.stdout.write(self.style.SUCCESS(
            f"Tayyor: {User.objects.count()} foydalanuvchi, {Subject.objects.count()} fan, {Test.objects.count()} test, "
            f"{Question.objects.count()} savol, {n_att} urinish.\n"
            "Kirish: admin/admin123 · dilnoza/teacher123 · aziz/student123"))
