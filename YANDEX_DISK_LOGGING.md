# Логирование запросов к API Яндекс.Диска

## Включение детального логирования

Для включения детального логирования всех запросов к API Яндекс.Диска установите переменную окружения:

```bash
YANDEX_DISK_DETAILED_LOGGING=true
```

## Что логируется

При включенном детальном логировании в логах будут отображаться:

### Запросы (REQ)
- Метод HTTP (GET, POST, PUT, DELETE)
- URL запроса
- Параметры запроса
- Заголовки (кроме Authorization для безопасности)
- Уникальный ID запроса для отслеживания

### Ответы (RES)
- Статус код ответа
- Время выполнения запроса (в миллисекундах)
- Размер ответа (в байтах)
- Content-Type ответа
- Уникальный ID запроса

### Ошибки (ERR)
- Статус код ошибки
- Код ошибки (ECONNABORTED, ETIMEDOUT и т.д.)
- Сообщение об ошибке
- Тело ответа (первые 500 символов)
- Время выполнения до ошибки

## Примеры логов

### Успешный запрос
```
[YD REQ abc123] GET /v1/disk/resources | params: {"path":"EasyCRM/boards/3/images"} | headers: ["User-Agent"]
[YD RES abc123] GET /v1/disk/resources | status: 200 | duration: 245ms | size: 1234 bytes | content-type: application/json
```

### Ошибка
```
[YD REQ xyz789] PUT /v1/disk/resources/upload | params: {"path":"EasyCRM/boards/3/images/file.png"} | headers: ["User-Agent"]
[YD ERR xyz789] PUT /v1/disk/resources/upload | status: 500 (Internal Server Error) | duration: 15000ms | code: ECONNABORTED | message: timeout of 15000ms exceeded | response: {"error":"..."}
```

## Просмотр логов на сервере

### 1. Просмотр логов в реальном времени (PM2)

Если приложение запущено через PM2:

```bash
# Просмотр всех логов
pm2 logs

# Просмотр логов конкретного процесса
pm2 logs nestjs

# Просмотр только логов Яндекс.Диска
pm2 logs nestjs | grep "YD REQ\|YD RES\|YD ERR"

# Просмотр последних 100 строк
pm2 logs nestjs --lines 100
```

### 2. Просмотр логов через journald (systemd)

Если приложение запущено как systemd service:

```bash
# Просмотр всех логов
journalctl -u nestjs -f

# Просмотр только логов Яндекс.Диска
journalctl -u nestjs -f | grep "YD REQ\|YD RES\|YD ERR"

# Просмотр логов за последний час
journalctl -u nestjs --since "1 hour ago" | grep "YD"

# Просмотр логов за конкретную дату
journalctl -u nestjs --since "2024-01-15 10:00:00" --until "2024-01-15 11:00:00" | grep "YD"
```

### 3. Просмотр логов из файла

Если логи пишутся в файл:

```bash
# Просмотр последних строк
tail -f /var/log/nestjs/app.log | grep "YD"

# Просмотр последних 1000 строк с фильтром
tail -n 1000 /var/log/nestjs/app.log | grep "YD REQ\|YD RES\|YD ERR"

# Поиск по конкретному запросу (по ID)
grep "abc123" /var/log/nestjs/app.log
```

### 4. Мониторинг ошибок

```bash
# Только ошибки
pm2 logs nestjs | grep "YD ERR"

# Ошибки с таймаутами
pm2 logs nestjs | grep "YD ERR" | grep "timeout\|ECONNABORTED\|ETIMEDOUT"

# Ошибки за последний час
journalctl -u nestjs --since "1 hour ago" | grep "YD ERR"
```

### 5. Анализ производительности

```bash
# Запросы дольше 1 секунды
pm2 logs nestjs | grep "YD RES" | grep -E "duration: [0-9]{4,}ms"

# Статистика по времени выполнения
pm2 logs nestjs | grep "YD RES" | grep -oP "duration: \K[0-9]+" | awk '{sum+=$1; count++} END {print "Average:", sum/count, "ms"}'
```

### 6. Мониторинг конкретного файла/пути

```bash
# Все запросы к конкретному пути
pm2 logs nestjs | grep "YD" | grep "boards/3/images"

# Все запросы загрузки файлов
pm2 logs nestjs | grep "YD" | grep "upload"
```

## Фильтрация логов

### По типу операции
```bash
# Только загрузки
grep "upload" | grep "YD"

# Только получение ресурсов
grep "resources" | grep "YD" | grep -v "upload"

# Только операции с папками
grep "ensureFolder\|deleteResource" | grep "YD"
```

### По статусу
```bash
# Только успешные (200)
grep "YD RES" | grep "status: 200"

# Только ошибки (4xx, 5xx)
grep "YD ERR" | grep -E "status: [45][0-9]{2}"

# Только сетевые ошибки
grep "YD ERR" | grep -E "ECONNABORTED|ETIMEDOUT|ENOTFOUND|ECONNRESET"
```

## Отключение логирования

Для отключения детального логирования:

```bash
# Удалить переменную или установить в false
YANDEX_DISK_DETAILED_LOGGING=false
```

Или просто не устанавливать переменную (по умолчанию логирование выключено).

## Производительность

⚠️ **Важно**: Детальное логирование может создавать большой объем логов, особенно при частых запросах. Рекомендуется:

1. Включать только при необходимости диагностики
2. Использовать ротацию логов
3. Настроить фильтрацию в системе логирования
4. Мониторить размер лог-файлов

## Интеграция с системами мониторинга

Логи можно интегрировать с системами мониторинга (ELK, Grafana Loki, Datadog и т.д.) для:

- Анализа производительности
- Алертов при ошибках
- Визуализации метрик
- Поиска паттернов проблем

Пример парсинга для ELK:
```json
{
  "type": "YD REQ",
  "requestId": "abc123",
  "method": "GET",
  "url": "/v1/disk/resources",
  "params": "...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

