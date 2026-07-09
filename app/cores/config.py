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
    gemini_api_key: str = ""
    resend_api_key: str = ""
    

    class Config:
        env_file = _ENV_FILE
        env_file_encoding = "utf-8"

settings = Settings() #type: ignore