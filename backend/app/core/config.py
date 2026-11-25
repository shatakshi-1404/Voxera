from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Voxera"
    database_url: str = "postgresql+asyncpg://voxera:voxera@localhost:5433/voxera"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 12
    customer_token_minutes: int = 60 * 4

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    voice_worker_secret: str = "dev-worker-secret"

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    # also allow every Vercel deployment/preview URL of this project (override with CORS_ORIGIN_REGEX, empty to disable)
    cors_origin_regex: str = r"https://voxera-[a-z0-9-]+\.vercel\.app"
    embedding_dim: int = 384
    rate_limit_enabled: bool = True  # set RATE_LIMIT_ENABLED=false for evals / e2e tests
    rag_min_score: float = 0.30
    auto_refund_limit: float = 5000
    return_window_days: int = 30


settings = Settings()
