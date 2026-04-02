## Матрица тест‑кейсов (по `Тесты.txt` + уточнения)

### Изменения объёма (уточнения заказчика)
- **Фото**: не реализуем → `TC‑08` **исключён**
- **Мобильное приложение**: не реализуем → `TC‑48…TC‑54` **исключены**
- **Push/FCM**: заменено на **SMS** → `TC‑23…TC‑27` выполняем, но **канал = SMS**

---

### Статус выполнения по TC

| TC | Статус | Где покрыто |
|---|---|---|
| TC‑01..TC‑07 | ✅ выполнено | `backend/orders/tests/test_orders_api.py` |
| TC‑08 | 🚫 исключён | Уточнение: фото не делаем |
| TC‑09..TC‑10 | ✅ выполнено | `backend/orders/tests/test_orders_api.py` |
| TC‑11..TC‑15 | ✅ выполнено | `backend/clients/tests/test_clients_api.py` |
| TC‑16..TC‑22 | ✅ выполнено | `backend/inventory/tests/test_inventory_api.py` |
| TC‑23..TC‑24 | ✅ выполнено (SMS) | `backend/notifications/tests/test_notifications_sms_flow.py` |
| TC‑25 | ⚠️ частично | Полная автоматическая рассылка профилактики (beat‑job) ещё не включена |
| TC‑26 | ✅ выполнено | `backend/notifications/tests/test_notifications_sms_flow.py` |
| TC‑27 | ⚠️ адаптировано | В SMS dry-run/очереди проверяем доставку/статусы, без “включения телефона” |
| TC‑28..TC‑32 | ✅ выполнено | `backend/reports/tests/test_reports.py` |
| TC‑33..TC‑35 | ✅ выполнено | `backend/users/tests/test_auth_and_permissions.py` (частично) + API user CRUD |
| TC‑36..TC‑38 | ✅ выполнено | `backend/reports/tests/test_admin_settings_and_backup.py` |
| TC‑39..TC‑41 | ✅ выполнено | `backend/users/tests/test_auth_and_permissions.py` |
| TC‑42..TC‑43 | ✅ выполнено (baseline) | см. `SECURITY_CHECKLIST.md` + авто‑тесты `backend/security/tests/test_security_baseline.py` |
| TC‑44..TC‑45 | ✅ выполнено (smoke) | `backend/reports/tests/test_admin_settings_and_backup.py` |
| TC‑46 | ⚠️ документировано | см. `LOAD_TEST.md` (скрипт + порядок прогонов) |
| TC‑47 | ⚠️ документировано | см. `UI_UX_CHECKLIST.md` (ручная проверка) |
| TC‑48..TC‑54 | 🚫 исключены | Уточнение: клиентского приложения нет |

