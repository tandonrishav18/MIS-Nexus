from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApplicationSettings
from app.schemas import AppSettingsOut, AppSettingsUpdateIn
from app.seed import ensure_seed_data, reset_database_to_demo
from app.services.finance import quantize_money
from app.services.ocr_service import get_ocr_status
from app.services.ollama_client import probe_ollama_health
from app.services.serializers import serialize_settings

router = APIRouter(prefix="/api/settings", tags=["Settings"])


class OllamaTestRequest(BaseModel):
    endpoint: Optional[str] = None
    model: Optional[str] = None


def _get_or_init_settings(db: Session) -> ApplicationSettings:
    cfg = db.query(ApplicationSettings).filter(ApplicationSettings.id == 1).first()
    if not cfg:
        ensure_seed_data(db)
        cfg = db.query(ApplicationSettings).filter(ApplicationSettings.id == 1).first()
    return cfg  # type: ignore[return-value]


@router.get("", response_model=AppSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    cfg = _get_or_init_settings(db)
    return serialize_settings(cfg)


@router.patch("", response_model=AppSettingsOut)
def update_settings(payload: AppSettingsUpdateIn, db: Session = Depends(get_db)):
    cfg = _get_or_init_settings(db)
    cfg.organization_name = payload.organizationName.strip()
    cfg.hub_code = payload.hubCode.strip()
    cfg.hub_gstin = payload.hubGstin.strip()
    cfg.admin_email = payload.adminEmail.strip()
    cfg.default_tax_rate_pct = quantize_money(payload.defaultTaxRatePct)
    cfg.auto_validate_on_submit = payload.autoValidateOnSubmit
    cfg.edi_standard_version = payload.ediStandardVersion.strip()
    cfg.segment_terminator = payload.segmentTerminator
    cfg.element_separator = payload.elementSeparator
    cfg.ollama_endpoint = payload.ollamaEndpoint.strip()
    cfg.ollama_model = payload.ollamaModel.strip()
    db.commit()
    db.refresh(cfg)
    return serialize_settings(cfg)


@router.post("/reset-demo", response_model=dict)
def reset_demo(db: Session = Depends(get_db)):
    reset_database_to_demo(db)
    return {"status": "reset", "message": "Demonstration dataset restored in SQLite."}


@router.get("/capabilities")
def get_capabilities(db: Session = Depends(get_db)):
    cfg = _get_or_init_settings(db)
    ollama = probe_ollama_health(cfg.ollama_endpoint, cfg.ollama_model)
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


@router.post("/test-ollama")
def test_ollama_connection(
    body: OllamaTestRequest | None = None,
    db: Session = Depends(get_db),
):
    cfg = _get_or_init_settings(db)
    endpoint = (body.endpoint if body and body.endpoint else cfg.ollama_endpoint).strip()
    model = (body.model if body and body.model else cfg.ollama_model).strip()
    ollama = probe_ollama_health(endpoint, model)
    return {
        "installationStatus": ollama.installation_status,
        "serviceStatus": ollama.service_status,
        "modelStatus": ollama.model_status,
        "overallStatus": ollama.overall_status,
        "endpoint": ollama.endpoint,
        "selectedModel": ollama.selected_model,
        "installedModels": ollama.installed_models,
        "binaryPath": ollama.binary_path,
        "error": ollama.error,
    }
