import os
from pydantic_settings import BaseSettings

_ENV_FILE = ".env.production" if os.getenv("ENVIRONMENT") == "production" else ".env"


class Settings(BaseSettings):
    database_hostname: str
    database_port: str
    database_password: str
    database_name: str
    database_username: str
    test_database_name: str
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    gemini_api_key: str
    turnstile_secret_key: str
    seed_manager_email: str
    seed_manager_password: str
    seed_manager_username: str = "manager"
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: str | None = None
    gmail_smtp_user: str
    gmail_smtp_password: str
    # If set to a single ISO-639-1 code (e.g. "ur"), Whisper always
    # transcribes as that language -- no detection performed. Leave unset
    # (None, the default) to let Whisper auto-detect the spoken language
    # across its full language list, with no restriction to any subset.
    whisper_language: str | None = None
    # IANA timezone name (e.g. "Asia/Karachi", "Europe/London") used to
    # decide what "end of day" means for auto_clock_out_stale_shifts.
    # Defaults to UTC. This app has no per-care-home settings table (see
    # note in app/models/user.py), so this is a single app-wide setting --
    # correct for a single-region deployment, and easy to change per
    # deployment if this app is ever run for a care home in another zone.
    app_timezone: str = "UTC"

    class Config:
        env_file = _ENV_FILE
        env_file_encoding = "utf-8"


settings = Settings()