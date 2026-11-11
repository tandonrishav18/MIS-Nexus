from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApplicationSettings
from app.schemas import AssistantQueryIn, AssistantQueryOut
from app.services.ai_assistant import answer_mis_query
from app.services.ocr_service import get_ocr_status
from app.services.ollama_client import probe_ollama_health

router = APIRouter(prefix="/api/ai", tags=["Local AI"])


class TestConnectionIn(BaseModel):
    endpoint: Optional[str] = None
    model: Optional[str] = None


def _get_cfg(db: Session) -> tuple[str, str]:
    cfg = db.query(ApplicationSettings).filter(ApplicationSettings.id == 1).first()
    if cfg:
        return cfg.ollama_endpoint, cfg.ollama_model
    return "http://localhost:11434", "qwen2.5:7b"


@router.get("/health")
def ai_health(db: Session = Depends(get_db)):
    endpoint, model = _get_cfg(db)
    ollama = probe_ollama_health(endpoint, model)
    ocr = get_ocr_status()
    return {
        "ollama": {
            "installationStatus": ollama.installation_status,
            "serviceStatus": ollama.service_status,
            "modelStatus": ollama.model_status,
            "overallStatus": ollama.overall_status,
            "endpoint": ollama.endpoint,
            "selectedModel": ollama.selected_model,
            "installedModels": ollama.installed_models,
            "binaryPath": ollama.binary_path,
            "error": ollama.error,
        },
        "ocr": {
            "installationStatus": ocr.installation_status,
            "ocrAvailability": ocr.ocr_availability,
            "available": ocr.available,
            "binaryPath": ocr.binary_path,
            "message": ocr.message,
        },
    }


@router.get("/models")
def ai_models(db: Session = Depends(get_db)):
    endpoint, model = _get_cfg(db)
    ollama = probe_ollama_health(endpoint, model)
    return {
        "serviceStatus": ollama.service_status,
        "selectedModel": ollama.selected_model,
        "modelStatus": ollama.model_status,
        "models": ollama.installed_models,
        "error": ollama.error,
    }


@router.post("/test-connection")
def test_ai_connection(
    body: TestConnectionIn | None = None,
    db: Session = Depends(get_db),
):
    cfg_endpoint, cfg_model = _get_cfg(db)
    endpoint = (body.endpoint if body and body.endpoint else cfg_endpoint).strip()
    model = (body.model if body and body.model else cfg_model).strip()
    ollama = probe_ollama_health(endpoint, model)
    ocr = get_ocr_status()
    return {
        "ollama": {
            "installationStatus": ollama.installation_status,
            "serviceStatus": ollama.service_status,
            "modelStatus": ollama.model_status,
            "overallStatus": ollama.overall_status,
            "endpoint": ollama.endpoint,
            "selectedModel": ollama.selected_model,
            "installedModels": ollama.installed_models,
            "binaryPath": ollama.binary_path,
            "error": ollama.error,
        },
        "ocr": {
            "installationStatus": ocr.installation_status,
            "ocrAvailability": ocr.ocr_availability,
            "available": ocr.available,
            "binaryPath": ocr.binary_path,
            "message": ocr.message,
        },
    }


@router.post("/query", response_model=AssistantQueryOut)
def ai_query(payload: AssistantQueryIn, db: Session = Depends(get_db)):
    res = answer_mis_query(db, payload.question)
    return AssistantQueryOut(
        reply=res["reply"],
        engineLabel=res["engineLabel"],
        relatedTransactionIds=res["relatedTransactionIds"],
        ollamaUsed=bool(res.get("ollamaUsed", False)),
    )

