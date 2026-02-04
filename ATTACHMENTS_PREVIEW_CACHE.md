# Кэширование превью вложений (attachments/preview-file)

## Что сделано
1) **Nginx proxy_cache для `GET /vsemo/attachments/preview-file`**
   - Кэш ключ: полный URL (`$scheme$proxy_host$request_uri`)
   - Включён `proxy_cache_lock` (защита от «шторма» при одновременных запросах)
   - `use_stale` и `background_update` для стабильности
   - Заголовок `X-Cache-Status` добавлен для контроля `MISS/HIT`

2) **In-memory кэш `href` (Yandex Disk download link) на стороне Nest**
   - TTL по умолчанию 5 минут
   - Лимит кэша по умолчанию 10 000 записей
   - Дедупликация одновременных запросов (`singleflight`)
   - Инвалидация кэша при ошибке стрима

3) **Плейсхолдер больше не “залипает”**
   - `placeholder.png` отдаётся с `Cache-Control: max-age=10`

---

## Где это находится
### Nginx
- `/etc/nginx/conf.d/preview-cache.conf`
  - `proxy_cache_path /var/cache/nginx/preview ...`
- `/etc/nginx/sites-available/nestjs`
  - отдельный `location /vsemo/attachments/preview-file`

### NestJS
- `src/domains/kanban/attachments/attachments.service.ts`
  - `hrefCache`, `hrefInFlight`, `hrefCacheTtlMs`, `hrefCacheMaxSize`
  - уменьшен `cacheSeconds` для placeholder

---

## Параметры (опционально)
Можно переопределить через env:
- `YD_HREF_CACHE_TTL_MS` — TTL кэша href (по умолчанию 300000)
- `YD_HREF_CACHE_MAX_SIZE` — лимит записей кэша (по умолчанию 10000)

---

## Как проверить
```bash
# Ожидаем MISS → HIT
curl -I "https://app.easy-crm.pro/vsemo/attachments/preview-file?path=...&w=160&format=webp" \
  | egrep -i "X-Cache-Status|Cache-Control"

# Смотреть сколько запросов к YD уходит в логах
pm2 logs nestjs-app --lines 200 | egrep -c "/resources/download"
```

---

## Что ещё желательно сделать (следующий уровень эффекта)
1) **Redis-кэш `href`**
   - Переживает рестарты
   - Можно шарить между инстансами при масштабировании

2) **Постоянный кэш превью на диске**
   - Сохранять результат `path+w+h+format` на диск/объектное хранилище
   - Резко снижает обращения к YD даже на `MISS` Nginx

3) **Явная маркировка плейсхолдера**
   - Добавить заголовок, например `X-Placeholder: 1`, чтобы Nginx мог настроить особый cache policy

4) **Ограничить допустимые `w/h`**
   - Защититься от DoS ресайзами
   - Стабильные размеры → лучше кэшируемость
