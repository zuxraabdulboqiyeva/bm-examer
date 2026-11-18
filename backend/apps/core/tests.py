"""API testlari — TZ'dagi qabul mezonlari asosida. Ishga tushirish: python manage.py test apps"""
from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.results.models import TestAttempt
from apps.tests_app.models import Test


class BMExamerAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', '--reset', verbosity=0)

    def client_for(self, username, password):
        c = APIClient()
        r = c.post('/api/auth/login/', {'username': username, 'password': password}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        c.credentials(HTTP_AUTHORIZATION='Bearer ' + r.json()['access'])
        return c

    def setUp(self):
        self.admin = self.client_for('admin', 'admin123')
        self.teacher = self.client_for('dilnoza', 'teacher123')
        self.student = self.client_for('aziz', 'student123')
        self.t1 = Test.objects.get(test_code='BM-7KQ2XD')

    # --- autentifikatsiya ---
    def test_wrong_password(self):
        r = APIClient().post('/api/auth/login/', {'username': 'aziz', 'password': 'x'}, format='json')
        self.assertEqual(r.status_code, 401)

    def test_register_and_login(self):
        r = APIClient().post('/api/auth/register/', {'username': 'yangi1', 'email': 'y@mail.uz', 'first_name': 'Ali',
                                                     'last_name': 'Valiyev', 'password': 'parol123', 'password2': 'parol123'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['user']['role'], 'student')

    def test_anonymous_blocked(self):
        self.assertEqual(APIClient().get('/api/bootstrap/').status_code, 401)

    # --- ruxsatlar (qabul mezoni 4) ---
    def test_student_forbidden_on_teacher_and_admin_endpoints(self):
        self.assertEqual(self.student.get('/api/users/').status_code, 403)
        self.assertEqual(self.student.post('/api/tests/', {}, format='json').status_code, 403)
        self.assertEqual(self.student.get(f'/api/tests/{self.t1.id}/questions/').status_code, 403)
        self.assertEqual(self.student.post('/api/subjects/', {'name': 'X'}, format='json').status_code, 403)

    def test_teacher_cannot_manage_subjects_or_others_tests(self):
        self.assertEqual(self.teacher.post('/api/subjects/', {'name': 'Kimyo'}, format='json').status_code, 403)
        other = Test.objects.get(test_code='BM-PAD3ZH')  # sardorniki
        self.assertEqual(self.teacher.post(f'/api/tests/{other.id}/complete/').status_code, 404)
        self.assertEqual(self.admin.post('/api/subjects/', {'name': 'Kimyo'}, format='json').status_code, 201)

    # --- bootstrap: o'quvchiga to'g'ri javoblar yuborilmaydi ---
    def test_student_bootstrap_has_no_answers(self):
        d = self.student.get('/api/bootstrap/').json()
        self.assertEqual(d['questions'], [])
        self.assertTrue(all(t['status'] != 'draft' for t in d['tests']))
        self.assertNotIn('phone', [k for u in d['users'] if u['id'] != d['me']['id'] for k in u])

    # --- test yechish oqimi ---
    def test_full_attempt_flow_and_grading(self):
        r = self.student.post(f'/api/tests/{self.t1.id}/start/')
        self.assertEqual(r.status_code, 201, r.content)
        payload = r.json()
        self.assertEqual(len(payload['questions']), 30)
        self.assertNotIn('is_correct', str(payload['questions']))
        aid = payload['attempt']['id']
        # bitta to'g'ri javob beramiz
        q = self.t1.questions.filter(question_type='single').first()
        right = q.choices.get(is_correct=True)
        self.assertEqual(self.student.post(f'/api/attempts/{aid}/answer/', {'question_id': q.id, 'value': [right.id]}, format='json').status_code, 200)
        res = self.student.post(f'/api/attempts/{aid}/submit/').json()
        self.assertTrue(res['attempt']['is_completed'])
        self.assertEqual(res['attempt']['correct_answers'], 1)
        self.assertEqual(res['attempt']['max_score'], 50.0)
        self.assertGreater(res['attempt']['score'], 0)

    def test_attempt_limit_enforced_by_api(self):
        # t1: max_attempts=2
        for _ in range(2):
            aid = self.student.post(f'/api/tests/{self.t1.id}/start/').json()['attempt']['id']
            self.student.post(f'/api/attempts/{aid}/submit/')
        self.assertEqual(self.student.post(f'/api/tests/{self.t1.id}/start/').status_code, 403)

    def test_strict_mode_force_submit_after_3_warnings(self):
        aid = self.student.post(f'/api/tests/{self.t1.id}/start/').json()['attempt']['id']
        states = [self.student.post(f'/api/attempts/{aid}/violation/', {'reason': 'tab'}, format='json').json()['state'] for _ in range(4)]
        self.assertEqual(states, ['warning', 'warning', 'warning', 'force_submitted'])
        a = TestAttempt.objects.get(pk=aid)
        self.assertTrue(a.force_submitted and a.is_completed)
        self.assertEqual(a.tab_switches, 4)

    def test_expired_attempt_auto_submitted(self):
        aid = self.student.post(f'/api/tests/{self.t1.id}/start/').json()['attempt']['id']
        TestAttempt.objects.filter(pk=aid).update(started_at=timezone.now() - timedelta(hours=2))
        r = self.student.post(f'/api/attempts/{aid}/answer/', {'question_id': self.t1.questions.first().id, 'value': ['x']}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(TestAttempt.objects.get(pk=aid).is_completed)

    def test_by_code(self):
        self.assertEqual(self.student.get('/api/tests/by-code/?code=bm-7kq2xd').status_code, 200)
        self.assertEqual(self.student.get('/api/tests/by-code/?code=BM-TR1ANG').status_code, 404)  # qoralama
        self.assertEqual(self.student.get('/api/tests/by-code/?code=BM-T4R9MA').status_code, 400)  # yakunlangan

    def test_score_only_hides_questions(self):
        t3 = Test.objects.get(test_code='BM-PAD3ZH')  # score_only
        aid = self.student.post(f'/api/tests/{t3.id}/start/').json()['attempt']['id']
        res = self.student.post(f'/api/attempts/{aid}/submit/').json()
        self.assertEqual(res['mode'], 'score_only')
        self.assertEqual(res['questions'], [])

    # --- o'qituvchi: savollar, faollashtirish, eksport ---
    def test_activation_requires_20_plus_10(self):
        draft = Test.objects.get(test_code='BM-TR1ANG')
        r = self.teacher.post(f'/api/tests/{draft.id}/activate/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('variantli', r.json()['detail'])

    def test_set_questions_assigns_block_points(self):
        r = self.teacher.post('/api/tests/', {'title': 'Yangi', 'subject_id': self.t1.subject_id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        tid = r.json()['id']
        qs = [{'question_type': 'written', 'text': f'{i}+{i}=?', 'answers': [str(2 * i)]} for i in range(10)]
        qs += [{'question_type': 'single', 'text': f'S{i}', 'choices': [{'text': 'a', 'is_correct': True}, {'text': 'b'}]} for i in range(20)]
        r = self.teacher.put(f'/api/tests/{tid}/questions/', {'questions': qs}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual([q['points'] for q in data[:1] + data[10:11] + data[20:21]], [1.2, 1.8, 2.0])
        self.assertEqual(data[25]['question_type'], 'written')
        self.assertEqual(self.teacher.post(f'/api/tests/{tid}/activate/').status_code, 200)

    def test_exports(self):
        for fmt, ctype in [('xlsx', 'spreadsheetml'), ('docx', 'wordprocessingml'), ('pdf', 'pdf')]:
            r = self.teacher.get(f'/api/tests/{self.t1.id}/export-results/?format={fmt}')
            self.assertEqual(r.status_code, 200)
            self.assertIn(ctype, r['Content-Type'])
        self.assertEqual(self.admin.get('/api/users/export/?format=pdf').status_code, 200)

    def test_bulk_users(self):
        r = self.admin.post('/api/users/bulk/', {'users': [{'first_name': 'A', 'last_name': 'B', 'username': 'ab1'},
                                                           {'first_name': 'C', 'last_name': 'D', 'username': 'cd1', 'role': 'teacher'}]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(all(u['password'] for u in r.json()['created']))
