# Анализ плагина Nuxt.js для обработки токенов

## Найденные проблемы в оригинальном коде

### ❌ Критическая проблема #1: Race Condition при параллельных запросах

**Проблема**: Если несколько запросов одновременно получают 401, все они попытаются обновить токен одновременно. Это может привести к:
- Множественным запросам на `/refresh`
- Ошибкам при обновлении токена
- Потере запросов

**Пример сценария**:
```typescript
// Пользователь открывает страницу, которая делает 5 запросов одновременно
// Все 5 запросов получают 401
// Все 5 запросов пытаются обновить токен → 5 запросов на /refresh
// Только первый успеет, остальные получат ошибку
```

### ❌ Проблема #2: Отсутствие проверки на `/refresh`

**Проблема**: Код проверяет только `/login`, но не `/refresh`. Если запрос на refresh вернет 401 (например, refresh token истек), код попытается обновить токен снова, что приведет к бесконечному циклу или ошибке.

**Исправление**: Добавить проверку на `/refresh`:
```typescript
const isAuthPath =
  cfg?.url === '/login' ||
  cfg?.url?.endsWith('/login') ||
  cfg?.url === '/refresh' ||
  cfg?.url?.endsWith('/refresh');
```

### ⚠️ Проблема #3: Отсутствие очереди для запросов

**Проблема**: Когда токен обновляется, другие запросы, которые получили 401, не ждут завершения обновления. Они просто отклоняются.

**Решение**: Использовать очередь для запросов, которые ждут обновления токена.

### ⚠️ Проблема #4: Неполная обработка ошибок

**Проблема**: Нет обработки ошибок 500+ и других статусов.

---

## Исправления в новой версии

### ✅ Исправление #1: Блокировка и очередь для параллельных запросов

```typescript
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}> = [];

// Если токен уже обновляется, добавляем запрос в очередь
if (isRefreshing) {
  return new Promise((resolve, reject) => {
    failedQueue.push({ resolve, reject });
  })
    .then(() => {
      // Повторяем запрос с новым токеном
      return useApi(cfg);
    });
}
```

### ✅ Исправление #2: Проверка на `/refresh`

```typescript
const isAuthPath =
  cfg?.url === '/login' ||
  cfg?.url?.endsWith('/login') ||
  cfg?.url === '/refresh' ||
  cfg?.url?.endsWith('/refresh');
```

### ✅ Исправление #3: Обработка очереди после обновления

```typescript
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// После успешного обновления
processQueue(null, data.accessToken);
```

### ✅ Исправление #4: Улучшенная обработка ошибок

- Добавлена обработка ошибок 500+
- Улучшены сообщения для пользователя
- Добавлено уведомление при истечении сессии

---

## Сравнение производительности

### Оригинальная версия:
- ❌ При 5 параллельных запросах с 401 → 5 запросов на `/refresh`
- ❌ 4 запроса теряются
- ❌ Пользователь видит ошибки

### Исправленная версия:
- ✅ При 5 параллельных запросах с 401 → 1 запрос на `/refresh`
- ✅ Все 5 запросов успешно выполняются после обновления
- ✅ Пользователь не видит ошибок

---

## Рекомендации по использованию

### 1. Замените оригинальный плагин на исправленную версию

Скопируйте код из `NUXT_PLUGIN_FIXED.ts` в ваш `plugins/axios.ts`

### 2. Протестируйте следующие сценарии:

1. **Параллельные запросы**:
   - Откройте страницу, которая делает несколько запросов одновременно
   - Дождитесь истечения токена (или удалите accessToken вручную)
   - Проверьте, что все запросы успешно выполняются после обновления

2. **Истечение refresh token**:
   - Удалите refreshToken из localStorage
   - Выполните любой запрос
   - Проверьте, что пользователь перенаправляется на `/login`

3. **Обычная работа**:
   - Убедитесь, что все запросы работают нормально
   - Проверьте, что токены обновляются автоматически

### 3. Дополнительные улучшения (опционально)

#### Предварительное обновление токена

Добавьте composable для предварительного обновления токена:

```typescript
// composables/useTokenRefresh.ts
export const useTokenRefresh = () => {
  const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 минут
  const ACCESS_TOKEN_LIFETIME = 2 * 60 * 60 * 1000; // 2 часа

  const scheduleTokenRefresh = () => {
    const tokenCreatedAt = localStorage.getItem('tokenCreatedAt');
    if (!tokenCreatedAt) return;

    const createdAt = parseInt(tokenCreatedAt, 10);
    const now = Date.now();
    const elapsed = now - createdAt;
    const timeUntilExpiry = ACCESS_TOKEN_LIFETIME - elapsed;
    const refreshTime = timeUntilExpiry - TOKEN_REFRESH_BUFFER;

    if (refreshTime > 0) {
      setTimeout(async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) return;

        try {
          const { data } = await $fetch('/refresh', {
            method: 'POST',
            body: { refreshToken },
          });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          localStorage.setItem('tokenCreatedAt', Date.now().toString());
          scheduleTokenRefresh();
        } catch (error) {
          console.error('Failed to refresh token:', error);
        }
      }, refreshTime);
    }
  };

  return { scheduleTokenRefresh };
};
```

Используйте при логине:

```typescript
// При успешном логине
localStorage.setItem('accessToken', data.accessToken);
localStorage.setItem('refreshToken', data.refreshToken);
localStorage.setItem('tokenCreatedAt', Date.now().toString());
const { scheduleTokenRefresh } = useTokenRefresh();
scheduleTokenRefresh();
```

---

## Чеклист для проверки

- [x] Блокировка параллельных обновлений токена
- [x] Очередь для запросов во время обновления
- [x] Проверка на `/refresh` endpoint
- [x] Обработка ошибок при обновлении токена
- [x] Перенаправление на логин при истечении refresh token
- [x] Улучшенные сообщения об ошибках
- [ ] Предварительное обновление токена (опционально)

---

## Заключение

Исправленная версия плагина решает все критические проблемы оригинального кода и обеспечивает надежную работу с токенами. Рекомендуется заменить оригинальный код на исправленную версию.

