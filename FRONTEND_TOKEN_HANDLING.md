# Инструкция по обработке токенов на фронтенде

## Общая информация

- **Access Token**: живет **2 часа** (7200 секунд)
- **Refresh Token**: живет **7 дней**
- **API Base URL**: `/vsemo`
- **Endpoints**:
  - `POST /vsemo/login` - авторизация
  - `POST /vsemo/refresh` - обновление токена
- **Формат токена**: `Authorization: Bearer <accessToken>`

## Критические моменты для предотвращения вылетов пользователей

### 1. Автоматическое обновление токена при 401 ошибке

**Проблема**: Когда access token истекает, сервер возвращает 401 Unauthorized. Без обработки пользователь вылетает из системы.

**Решение**: Перехватывать 401 ошибки и автоматически обновлять токен через refresh endpoint.

### 2. Предварительное обновление токена перед истечением

**Проблема**: Если токен истекает во время выполнения запроса, пользователь получает ошибку.

**Решение**: Обновлять токен заранее (например, за 5-10 минут до истечения).

### 3. Обработка параллельных запросов

**Проблема**: Если несколько запросов одновременно получают 401, все они пытаются обновить токен, что может привести к гонке.

**Решение**: Использовать очередь или блокировку для обновления токена.

---

## Примеры реализации

### React + Axios

```typescript
// services/api.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = 'https://your-api-domain.com/vsemo';

// Создаем экземпляр axios
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Функции для работы с токенами
const getAccessToken = (): string | null => {
  return localStorage.getItem('accessToken');
};

const getRefreshToken = (): string | null => {
  return localStorage.getItem('refreshToken');
};

const setTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
};

const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

// Флаг для предотвращения множественных обновлений токена
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}> = [];

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

// Функция обновления токена
const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/refresh`, {
      refreshToken,
    });
    const { accessToken, refreshToken: newRefreshToken } = response.data;
    setTokens(accessToken, newRefreshToken);
    return accessToken;
  } catch (error) {
    clearTokens();
    // Перенаправляем на страницу логина
    window.location.href = '/login';
    throw error;
  }
};

// Interceptor для добавления токена к запросам
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Interceptor для обработки ответов и обновления токена
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Если ошибка 401 и это не запрос на refresh/login
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/login') &&
      !originalRequest.url?.includes('/refresh')
    ) {
      if (isRefreshing) {
        // Если токен уже обновляется, добавляем запрос в очередь
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccessToken = await refreshAccessToken();
        processQueue(null, newAccessToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
```

### Предварительное обновление токена (React Hook)

```typescript
// hooks/useTokenRefresh.ts
import { useEffect, useRef } from 'react';

const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 минут до истечения
const ACCESS_TOKEN_LIFETIME = 2 * 60 * 60 * 1000; // 2 часа

export const useTokenRefresh = () => {
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const scheduleTokenRefresh = () => {
      // Очищаем предыдущий таймер
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      const tokenCreatedAt = localStorage.getItem('tokenCreatedAt');
      if (!tokenCreatedAt) return;

      const createdAt = parseInt(tokenCreatedAt, 10);
      const now = Date.now();
      const elapsed = now - createdAt;
      const timeUntilExpiry = ACCESS_TOKEN_LIFETIME - elapsed;
      const refreshTime = timeUntilExpiry - TOKEN_REFRESH_BUFFER;

      if (refreshTime > 0) {
        refreshTimerRef.current = setTimeout(async () => {
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) return;

            const response = await fetch('/vsemo/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken }),
            });

            if (response.ok) {
              const { accessToken, refreshToken: newRefreshToken } =
                await response.json();
              localStorage.setItem('accessToken', accessToken);
              localStorage.setItem('refreshToken', newRefreshToken);
              localStorage.setItem('tokenCreatedAt', Date.now().toString());
              // Планируем следующее обновление
              scheduleTokenRefresh();
            }
          } catch (error) {
            console.error('Failed to refresh token:', error);
          }
        }, refreshTime);
      }
    };

    scheduleTokenRefresh();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
};
```

### Vue 3 + Axios

```typescript
// plugins/axios.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = 'https://your-api-domain.com/vsemo';

const api = axios.create({
  baseURL: API_BASE_URL,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}> = [];

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

const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const response = await axios.post(`${API_BASE_URL}/refresh`, {
    refreshToken,
  });
  const { accessToken, refreshToken: newRefreshToken } = response.data;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', newRefreshToken);
  return accessToken;
};

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/login') &&
      !originalRequest.url?.includes('/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccessToken = await refreshAccessToken();
        processQueue(null, newAccessToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
```

### Fetch API (Vanilla JavaScript)

```javascript
// api.js
const API_BASE_URL = 'https://your-api-domain.com/vsemo';

let isRefreshing = false;
let refreshPromise = null;

const getAccessToken = () => localStorage.getItem('accessToken');
const getRefreshToken = () => localStorage.getItem('refreshToken');

const setTokens = (accessToken, refreshToken) => {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
};

const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const response = await fetch(`${API_BASE_URL}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    window.location.href = '/login';
    throw new Error('Failed to refresh token');
  }

  const { accessToken, refreshToken: newRefreshToken } = await response.json();
  setTokens(accessToken, newRefreshToken);
  return accessToken;
};

const apiRequest = async (url, options = {}) => {
  const token = getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  // Если получили 401, пытаемся обновить токен
  if (
    response.status === 401 &&
    !url.includes('/login') &&
    !url.includes('/refresh')
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken();
    }

    try {
      const newToken = await refreshPromise;
      // Повторяем запрос с новым токеном
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers,
      });
    } catch (error) {
      throw error;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  }

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
};

export default apiRequest;
```

---

## Важные рекомендации

### 1. Хранение токенов

- **Не храните токены в cookies** (если не используете httpOnly cookies на бэкенде)
- Используйте **localStorage** или **sessionStorage**
- Для повышенной безопасности рассмотрите использование **httpOnly cookies** на бэкенде

### 2. Обработка ошибок

```typescript
// Всегда обрабатывайте случаи, когда refresh token тоже истек
if (error.response?.status === 401) {
  // Если refresh не помог, перенаправляем на логин
  clearTokens();
  router.push('/login');
}
```

### 3. Логирование

```typescript
// Логируйте ошибки обновления токена для отладки
console.error('Token refresh failed:', error);
// Но не логируйте сами токены!
```

### 4. Проверка перед запросами

```typescript
// Проверяйте наличие токена перед запросами
if (!getAccessToken()) {
  // Перенаправляем на логин
  window.location.href = '/login';
  return;
}
```

### 5. Обработка входа

```typescript
// При успешном логине сохраняйте оба токена
const login = async (email: string, password: string) => {
  const response = await api.post('/login', { email, password });
  const { accessToken, refreshToken } = response.data;
  setTokens(accessToken, refreshToken);
  // Сохраняем время создания токена для предварительного обновления
  localStorage.setItem('tokenCreatedAt', Date.now().toString());
};
```

---

## Тестирование

### Проверка автоматического обновления

1. Войдите в систему
2. Откройте DevTools → Application → Local Storage
3. Удалите `accessToken` (оставьте `refreshToken`)
4. Выполните любой запрос к API
5. Проверьте, что токен автоматически обновился

### Проверка обработки истекшего refresh token

1. Установите старую дату для `refreshToken` в БД (или подождите 7 дней)
2. Попробуйте выполнить запрос
3. Проверьте, что пользователь перенаправляется на страницу логина

---

## Чеклист для фронтенда

- [ ] Перехват 401 ошибок реализован
- [ ] Автоматическое обновление токена при 401
- [ ] Обработка параллельных запросов (очередь/блокировка)
- [ ] Предварительное обновление токена перед истечением
- [ ] Обработка случая, когда refresh token тоже истек
- [ ] Перенаправление на логин при неудачном обновлении
- [ ] Сохранение времени создания токена для предварительного обновления
- [ ] Очистка токенов при выходе из системы
- [ ] Проверка наличия токена перед запросами

---

## Дополнительные улучшения

### 1. Retry механизм

```typescript
const retryRequest = async (requestFn, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};
```

### 2. Уведомление пользователя

```typescript
// Показывайте уведомление, если сессия скоро истечет
if (timeUntilExpiry < 10 * 60 * 1000) {
  showNotification('Ваша сессия скоро истечет. Пожалуйста, сохраните работу.');
}
```

### 3. Сохранение состояния при обновлении токена

```typescript
// Сохраняйте состояние приложения перед обновлением токена
const saveAppState = () => {
  // Сохраните текущий маршрут, данные формы и т.д.
};
```

---

## Контакты для вопросов

Если возникнут проблемы с реализацией, обратитесь к бэкенд-разработчику.
