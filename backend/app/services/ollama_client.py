from dataclasses import dataclass
import os
import shutil
from typing import Any, Optional

import httpx


@dataclass
class OllamaHealthStatus:
    installation_status: str  # "Installed" | "Not Installed"
    service_status: str       # "Connected" | "Not Running" | "Unavailable"
    model_status: str         # "Connected" | "Model Not Downloaded" | "Unavailable"
    overall_status: str       # "Connected" | "Not Installed" | "Not Running" | "Model Not Downloaded" | "Unavailable"
    endpoint: str
    selected_model: str
    installed_models: list[str]
    binary_path: Optional[str]
    error: Optional[str]


def find_ollama_binary() -> Optional[str]:
    on_path = shutil.which("ollama")
    if on_path:
        return on_path
    candidates = [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe"),
        r"C:\Program Files\Ollama\ollama.exe",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def probe_ollama_health(
    endpoint: str = "http://localhost:11434",
    selected_model: str = "qwen2.5:7b",
    timeout_sec: float = 1.8,
) -> OllamaHealthStatus:
    """Probe local Ollama installation, daemon reachability, and model availability."""
    base = endpoint.rstrip("/")
    binary = find_ollama_binary()
    install_status = "Installed" if binary else "Not Installed"

    try:
        with httpx.Client(timeout=timeout_sec) as client:
            resp = client.get(f"{base}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [
                m.get("name", "").strip()
                for m in data.get("models", [])
                if m.get("name")
            ]

            model_present = selected_model in models
            if not model_present and ":" not in selected_model:
                model_present = any(m.startswith(f"{selected_model}:") for m in models)

            if model_present:
                model_status = "Connected"
                overall_status = "Connected"
                err = None
            else:
                model_status = "Model Not Downloaded"
                overall_status = "Model Not Downloaded"
                err = (
                    f"Ollama service is running, but selected model '{selected_model}' is not downloaded locally."
                )

            return OllamaHealthStatus(
                installation_status=install_status,
                service_status="Connected",
                model_status=model_status,
                overall_status=overall_status,
                endpoint=base,
                selected_model=selected_model,
                installed_models=models,
                binary_path=binary,
                error=err,
            )
    except Exception as exc:
        service_status = "Not Running" if binary else "Unavailable"
        overall_status = "Not Running" if binary else "Not Installed"
        return OllamaHealthStatus(
            installation_status=install_status,
            service_status=service_status,
            model_status="Unavailable",
            overall_status=overall_status,
            endpoint=base,
            selected_model=selected_model,
            installed_models=[],
            binary_path=binary,
            error=str(exc),
        )


def chat_with_ollama(
    endpoint: str,
    model: str,
    messages: list[dict[str, str]],
    timeout_sec: float = 20.0,
    json_mode: bool = False,
) -> tuple[Optional[str], Optional[str]]:
    """
    Execute a local /api/chat request against Ollama.
    Returns (content, error_message). Never exposes exceptions as successful AI output.
    """
    base = endpoint.rstrip("/")
    payload: dict[str, Any] = {
        "model": model,
        "stream": False,
        "messages": messages,
    }
    if json_mode:
        payload["format"] = "json"

    try:
        with httpx.Client(timeout=timeout_sec) as client:
            resp = client.post(f"{base}/api/chat", json=payload)
            if resp.status_code == 404:
                return None, f"Model '{model}' was not found on local Ollama ({base})."
            resp.raise_for_status()
            body = resp.json()
            if body.get("error"):
                return None, str(body["error"])
            content = (body.get("message") or {}).get("content", "").strip()
            if not content:
                return None, "Local Ollama returned an empty response."
            return content, None
    except httpx.TimeoutException:
        return None, f"Local Ollama request timed out after {timeout_sec}s."
    except Exception as exc:
        return None, f"Local Ollama unavailable: {exc}"

