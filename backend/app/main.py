from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ensure_data_dir
from app.routers import chapters, config, health, memory, projects

ensure_data_dir()

app = FastAPI(title="AI Novel Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(projects.router, prefix="/api", tags=["projects"])
app.include_router(chapters.router, prefix="/api", tags=["chapters"])
app.include_router(memory.router, prefix="/api", tags=["memory"])


@app.get("/")
def root():
    return {"message": "AI Novel Agent API is running"}
