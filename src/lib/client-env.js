export function getRequiredClientEnv(name) {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required client environment variable: ${name}`);
  }
  return value;
}
