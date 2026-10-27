from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    veyra_dev_token: SecretStr = SecretStr("")
    database_url: SecretStr = SecretStr("postgresql://veyra:veyra-local@127.0.0.1:5432/veyra")
    model_api_key: SecretStr = SecretStr("")
    meta_model: str = "muse-spark-1.3"
    camera_allowed_cidrs: str = ""
    camera_sources_json: str = "{}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
