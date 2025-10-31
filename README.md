## Revit Metrics: плагин для Autodesk Revit 2022 + сервер с админ‑панелью

Этот проект собирает метрики изменений элементов в Autodesk Revit и отправляет их на сервер FastAPI. Веб‑панель (встроенный фронтенд) показывает графики и таблицы изменений.

- **Плагин (C#/.NET)**: каталог `plugin/` — отслеживает изменения в проекте и шлёт метрики на сервер.
- **Сервер (Python/FastAPI + PostgreSQL)**: каталог `backend/` — REST API, статика с админ‑панелью.
- **Фронтенд (HTML/CSS/JS)**: каталог `frontend/` — дашборд и простая локальная авторизация.

### 1. Установка плагина:
Исходники: `plugin/RevitMetrics/` и манифест `plugin/RevitMetrics.addin`.

#### 1.1 В файле `plugin/RevitMetrics/MetricsWriter.cs` задайте базовый URL API:

```csharp
private const string ApiBaseUrl = "http://server_ip:port"; // например, http://192.168.1.10:8000
```

Плагин выполняет:

1. `GET {ApiBaseUrl}/users/?nickname=<Username>` (ожидает список пользователей и берёт первый с подходящим никнеймом или создаёт нового при отсутствии запрошенного никнейма в базе)
2. `POST {ApiBaseUrl}/metrics/` — отправка метрики

#### 1.2 Сборка

1. Откройте `plugin/RevitMetrics.sln` в Visual Studio, установите нужную версию .NET Framework (минимально 4.8)
2. Установите необходимые NuGet пакеты:
  - Newtonsoft.Json
  - Npgsql
  - System.Net.Http.Json
  - System.Text.Encodings.Web
  - System.Text.Json
3. Добавьте в ваш проект RevitAPI
  - Проект - Добавить ссылку - добавляете 'C:\Program Files\Autodesk\Revit 2022\RevitAPI.dll' и 'C:\Program Files\Autodesk\Revit 2022\RevitAPIUI.dll'
4. Соберите библиотеку

#### 1.3 Установка в Revit

1. Создайте по пути `C:\ProgramData\Autodesk\Revit\Addins\2022` папку с названием `RevitMetrics` и скопируйте в неё все файлы из папки сборки
2. Поместите файл `plugin/RevitMetrics.addin` в каталог плагинов Revit `C:\ProgramData\Autodesk\Revit\Addins\2022\RevitMetrics.addin`
3. В `.addin` убедитесь, что путь `Assembly` указывает на DLL.

Перезапустите Revit, если он был до этого запущен.

### 2. Развёртывание сервера (FastAPI)

#### 2.1 Создайте виртуальное окружение и установите пакеты:

```bash
cd projectDirectory
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install fastapi uvicorn[standard] sqlalchemy psycopg2-binary pydantic
```

#### 2.2 Подготовка базы PostgreSQL

Создайте пользователя и БД (на сервере):

```bash
CREATE ROLE db_role WITH LOGIN PASSWORD 'role_password';
CREATE DATABASE database_name OWNER db_role;
GRANT ALL PRIVILEGES ON DATABASE database_name TO db_role;
```

В файле `backend/database.py` укажите строку подключения:

```python
# порт 5432 является стандартным для PostgreSQL - если вы его меняли, нужно поменять и здесь
SQLALCHEMY_DATABASE_URL = "postgresql://db_role:role_password@127.0.0.1:5432/database_name" 
```

Таблицы создаются автоматически при старте приложения (см. `Base.metadata.create_all` в `backend/main.py`).

#### 2.3 Запуск сервера
Приложение раздаёт фронтенд из `frontend/` на корне `/` и статику на `/static`.

```bash
cd projectDirectory
source venv/bin/activate
cd /backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Проверьте:

- API: `GET http://<server_ip>:8000/api/metrics/`
- Веб‑панель: откройте `http://<server_ip>:8000/`

### 2.4 Основные эндпоинты

- `POST /api/users/` — создать пользователя
- `GET /api/users/` — список пользователей
- `POST /api/metrics/` — записать метрику
- `GET /api/metrics/` — список метрик (опционально с `user_id`, `start_date`, `end_date`)
- `GET /api/metrics/summary/` — агрегированная статистика

Примеры:

```bash
# создать пользователя
curl -X POST http://<server_ip>:8000/api/users/ \
  -H 'Content-Type: application/json' \
  -d '{
        "nickname": "jdoe",
        "name": "John",
        "surname": "Doe",
        "patronymic": null
      }'

# добавить метрику
curl -X POST http://<server_ip>:8000/api/metrics/ \
  -H 'Content-Type: application/json' \
  -d '{
        "user_id": 1,
        "project": "Office.rvt",
        "timestamp": "2025-10-30T12:34:56Z",
        "added": 3,
        "modified": 2,
        "deleted": 1
      }'
```
