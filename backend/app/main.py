from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api_catalog import register_routers
from app.config import ensure_data_dir
from app.services import skill_loader

ensure_data_dir()
skill_loader.load_skills()

app = FastAPI(title="AI Novel Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_routers(app)


@app.get("/")
def root():
    return {"message": "AI Novel Agent API is running"}
