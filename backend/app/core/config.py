
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_env: str = "development"
    secret_key: str
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    database_url: str

    llm_provider: str = "mock"
    llm_api_key: str = ""
    llm_model: str = ""

    tesseract_cmd: str = (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
