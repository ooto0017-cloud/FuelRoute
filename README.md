# FuelRoute — запуск в Windows

FuelRoute — прототип расчёта топлива и выбора АЗС по маршруту в Ташкенте. Первый этап работает локально. На карте используются учебный граф и условные АЗС. Время поездки моделируется учебными задержками. Интерфейс адаптируется к экрану телефона.

## 1. Установить Python

Нужен Python 3.10 или новее. Откройте PowerShell и проверьте команду:

```powershell
py -3 --version
```

Если команда недоступна, установите Python с https://www.python.org/downloads/windows/ и откройте PowerShell заново. Если доступна только команда `python`, используйте её вместо `py -3`.

## 2. Создать новую папку и распаковать архив

Сохраните `FuelRoute.zip` в папку «Загрузки». Если браузер сохраняет файлы в другую папку, поправьте путь к архиву.

```powershell
$archive = Join-Path $env:USERPROFILE 'Downloads\FuelRoute.zip'
$workspace = Join-Path $env:USERPROFILE 'FuelRoute-Workspace'
New-Item -ItemType Directory -Path $workspace -ErrorAction Stop | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $workspace -ErrorAction Stop
Set-Location (Join-Path $workspace 'FuelRoute')
Get-ChildItem
```

Если папка уже существует, укажите новое имя в переменной `$workspace`. Для повторного запуска используйте только `Set-Location` и команду запуска ниже.

## 3. Запустить

```powershell
py -3 .\server.py
```

Во втором окне PowerShell откройте интерфейс:

```powershell
Start-Process 'http://127.0.0.1:8000/'
```

Пакеты и ключи API не требуются. Остановка сервера — Ctrl+C в первом окне.

## 4. Проверить расчёт

| Сценарий | Действие | Ожидаемый результат |
|---|---|---|
| Нужна заправка | Оставить исходные значения и нажать «Рассчитать маршрут» | Остановка на учебной АЗС А |
| Хватает топлива | Указать остаток 2 л | Маршрут без остановки |
| Ни одна АЗС недостижима | Указать остаток 0,25 л при запасе 0,2 л | Сообщение о невозможности поездки по учебной сети |
| Пробки меняют маршрут | При остатке 2 л включить и выключить пробки | Через Северный вокзал с пробками, через Дружбу народов без пробок |
| Метан | Выбрать метан и ввести расход 9, остаток 0,75, запас 0,2 и ёмкость 20 | АЗС Б, расчёт в м³ |

Проверка API в PowerShell:

```powershell
$payload = @{
  start = 'chilonzor'
  end = 'amir'
  fuel = 'gasoline'
  traffic = $true
  consumption = 9
  remaining = 0.5
  reserve = 0.2
  capacity = 50
} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/plan' -Method Post -ContentType 'application/json' -Body $payload
```

## Структура

```text
FuelRoute/
  README.md
  engine.py           # Граф, модель топлива, отбор АЗС
  server.py           # Локальный HTTP API и раздача интерфейса
  web/
    index.html        # Форма и схема маршрута
    app.js            # Вызов API и визуализация
    style.css         # Адаптивная вёрстка
  docs/
    01-TZ.md          # Окончательное ТЗ
    02-Architecture.md
    03-Dissertation.md
```

## Веб-деплой на Vercel

Импортируйте репозиторий с корневой директорией проекта. Конфигурация
`vercel.json` публикует интерфейс из `web/`, а `api/` предоставляет две
Python-функции. Локальный сервер остаётся доступен через `py -3 .\\server.py`.
Демоверсия не требует переменных окружения.
