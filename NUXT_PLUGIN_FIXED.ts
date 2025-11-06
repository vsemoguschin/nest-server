// plugins/axios.ts - ИСПРАВЛЕННАЯ ВЕРСИЯ

import axios from 'axios';
import type {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosError,
} from 'axios';
import { useToast } from '@/components/ui/toast/use-toast';

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const router = useRouter();
  const { toast } = useToast();
  const isClient = typeof window !== 'undefined';

  const useApi: AxiosInstance = axios.create({
    baseURL: config.public.baseURL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  });

  // Флаг для предотвращения множественных обновлений токена
  let isRefreshing = false;
  let failedQueue: Array<{
    resolve: (value?: any) => void;
    reject: (error?: any) => void;
  }> = [];

  // Обработка очереди запросов после обновления токена
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

  // REQUEST INTERCEPTOR
  useApi.interceptors.request.use(
    (req: InternalAxiosRequestConfig) => {
      if (isClient) {
        const token = localStorage.getItem('accessToken');
        if (token) {
          if (typeof (req.headers as any)?.set === 'function') {
            (req.headers as any).set('Authorization', `Bearer ${token}`);
          } else {
            (req.headers as any) = {
              ...(req.headers as any),
              Authorization: `Bearer ${token}`,
            };
          }
        }
      }
      return req;
    },
    (error: AxiosError) => {
      console.error('Request error:', error);
      if (isClient) {
        toast({
          variant: 'destructive',
          title: 'Ошибка запроса',
          description:
            (error as any)?.response?.data?.message ??
            'Не удалось отправить запрос. Попробуйте позже.',
        });
      }
      return Promise.reject(error);
    },
  );

  // RESPONSE INTERCEPTOR
  useApi.interceptors.response.use(
    (response) => {
      if (isClient && response?.data?.message) {
        toast({ title: 'Успешно', description: response.data.message });
      }
      return response;
    },
    async (err: AxiosError<any>) => {
      const cfg = err.config as
        | (InternalAxiosRequestConfig & { _retry?: boolean })
        | undefined;

      const status = err.response?.status;
      const url =
        cfg?.url ??
        (typeof (err as any)?.request?.responseURL === 'string'
          ? (err as any).request.responseURL
          : 'unknown');

      console.error(
        'Response error:',
        url,
        status,
        err.response?.data ?? err.message,
      );

      // Если нет ответа вообще (сеть/таймаут)
      if (!err.response) {
        if (isClient) {
          toast({
            variant: 'destructive',
            title: 'Ошибка соединения',
            description:
              'Не удалось получить ответ от сервера. Проверьте подключение к интернету.',
          });
        }
        return Promise.reject(err);
      }

      // На SSR не пытаемся рефрешить токен (локальное хранилище недоступно)
      if (!isClient) {
        return Promise.reject(err);
      }

      // Проверяем, не является ли это запросом на логин или refresh
      const isAuthPath =
        cfg?.url === '/login' ||
        cfg?.url?.endsWith('/login') ||
        cfg?.url === '/refresh' ||
        cfg?.url?.endsWith('/refresh');

      // Обработка 401 ошибки с автоматическим обновлением токена
      if (!isAuthPath && status === 401 && cfg && !cfg._retry) {
        // Если токен уже обновляется, добавляем запрос в очередь
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then(() => {
              // Обновляем заголовок с новым токеном
              const newToken = localStorage.getItem('accessToken');
              if (newToken && cfg.headers) {
                if (typeof (cfg.headers as any)?.set === 'function') {
                  (cfg.headers as any).set('Authorization', `Bearer ${newToken}`);
                } else {
                  (cfg.headers as any) = {
                    ...(cfg.headers as any),
                    Authorization: `Bearer ${newToken}`,
                  };
                }
              }
              return useApi(cfg);
            })
            .catch((error) => {
              return Promise.reject(error);
            });
        }

        // Начинаем обновление токена
        cfg._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }

          const { data } = await axios.post(
            `${config.public.baseURL}/refresh`,
            { refreshToken },
            {
              headers: { 'Content-Type': 'application/json' },
              withCredentials: true,
            },
          );

          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);

          // Обрабатываем очередь запросов
          processQueue(null, data.accessToken);

          // Обновляем заголовок для исходного запроса
          if (cfg.headers) {
            if (typeof (cfg.headers as any)?.set === 'function') {
              (cfg.headers as any).set('Authorization', `Bearer ${data.accessToken}`);
            } else {
              (cfg.headers as any) = {
                ...(cfg.headers as any),
                Authorization: `Bearer ${data.accessToken}`,
              };
            }
          }

          // Повторяем исходный запрос с обновлёнными токенами
          return useApi(cfg);
        } catch (_error) {
          // Если обновление токена не удалось, очищаем всё и перенаправляем на логин
          processQueue(_error, null);
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');

          console.warn('Redirect to /login after refresh failure');

          if (isClient) {
            toast({
              variant: 'destructive',
              title: 'Сессия истекла',
              description: 'Пожалуйста, войдите в систему снова.',
            });
          }

          try {
            await router.replace('/login');
          } catch (navErr) {
            console.warn('Router replace failed:', navErr);
          }

          return Promise.reject(_error);
        } finally {
          isRefreshing = false;
        }
      }

      // Обработка других ошибок
      if (status === 403) {
        if (isClient) {
          toast({
            variant: 'destructive',
            title: 'Нет доступа',
            description:
              err.response?.data?.message ??
              'У вас нет прав для выполнения этой операции.',
          });
        }
        return Promise.reject(err);
      }

      // Общая обработка ошибок сервера
      if (isClient && status && status >= 500) {
        toast({
          variant: 'destructive',
          title: `Ошибка сервера ${status}`,
          description:
            err.response?.data?.message ?? 'Произошла ошибка на сервере.',
        });
      } else if (isClient && status && status >= 400) {
        toast({
          variant: 'destructive',
          title: `Ошибка ${status}`,
          description:
            err.response?.data?.message ?? 'Произошла ошибка при выполнении запроса.',
        });
      }

      return Promise.reject(err);
    },
  );

  nuxtApp.provide('useApi', useApi);
});

