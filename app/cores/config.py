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
    # Issue #22 fix: no more `= ""` defaults on required external-service
    # keys. Leaving them optional let the app start "healthy" and only fail
    # deep inside a request the first time a user hit that feature. Making
    # them required (like secret_key already was) fails fast at startup.
    gemini_api_key: str
    resend_api_key: str

    class Config:
        env_file = _ENV_FILE
        env_file_encoding = "utf-8"


settings = Settings()  # type: ignore
