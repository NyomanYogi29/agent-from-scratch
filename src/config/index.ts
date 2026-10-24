const getEnvOrDefault = (key: string, defaultValue: string): string => {
  const value = Bun.env[key];
  return value && value.trim() !== "" ? value.trim() : defaultValue;
};

export const config = Object.freeze({
  TELEGRAM_BOT_TOKEN: getEnvOrDefault("TELEGRAM_BOT_TOKEN", ""),
  MASTER_TELEGRAM_ID: Number(getEnvOrDefault("MASTER_TELEGRAM_ID", "0")),

  MASTER_FULL_NAME: Bun.env["MASTER_FULL_NAME"],

  OPENROUTER_API_KEY: getEnvOrDefault("OPENROUTER_API_KEY", ""),
  OPENROUTER_BASE_URL: getEnvOrDefault("OPENROUTER_BASE_URL", ""),
  OPENROUTER_MODEL: getEnvOrDefault("OPENROUTER_MODEL", ""),
});
