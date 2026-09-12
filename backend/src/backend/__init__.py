from fastapi import FastAPI

from .api.routes.health import router as health_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="CarbonLens API",
        description="Backend service for the CarbonLens platform",
        version="0.1.0",
    )
    app.include_router(health_router)
    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)
