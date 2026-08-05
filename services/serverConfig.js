export const DEFAULT_LISTEN_HOST = '127.0.0.1';

export const getListenHost = (environment = process.env) => {
  const value = String(environment.HOST ?? '').trim();
  return value || DEFAULT_LISTEN_HOST;
};
