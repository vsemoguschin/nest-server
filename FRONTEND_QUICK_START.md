# Быстрый старт: Обработка токенов на фронтенде

## Ключевые моменты

- **Access Token**: живет 2 часа
- **Refresh Token**: живет 7 дней
- **API**: `/vsemo/login`, `/vsemo/refresh`

## Минимальная реализация (Axios)

```typescript
import axios from 'axios';

const api = axios.create({ baseURL: '/vsemo' });

let isRefreshing = false;
let failedQueue: any[] = [];

const refreshToken = async () => {
  const refresh = localStorage.getItem('refreshToken');
  const { data } = await axios.post('/vsemo/refresh', { refreshToken: refresh });
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  return data.accessToken;
};

// Добавляем токен к каждому запросу
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Обрабатываем 401 и обновляем токен
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          failedQueue.push({ resolve });
        }).then(() => {
          originalRequest.headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshToken();
        failedQueue.forEach(({ resolve }) => resolve());
        failedQueue = [];
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        throw refreshError;
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

## При логине

```typescript
const login = async (email: string, password: string) => {
  const { data } = await api.post('/login', { email, password });
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
};
```

## При выходе

```typescript
const logout = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};
```

**Полная инструкция**: см. `FRONTEND_TOKEN_HANDLING.md`

