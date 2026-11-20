#!/usr/bin/env python3
"""
Bootstrap de los flujos de diagnostico con IA (n8n + Qdrant + Gemini).

Uso:
    python3 n8n/scripts/bootstrap_ia.py
    python3 n8n/scripts/bootstrap_ia.py --sin-activar-monitor
    python3 n8n/scripts/bootstrap_ia.py --env-file .env

Que hace (idempotente, no imprime secretos):
    1. Credenciales en n8n
       - "Qdrant Rayuela" (qdrantApi) y "Qdrant API Key Header": con la clave de secrets/qdrant_api_key.
       - "Diagnostico Webhook Token" (header X-Diagnostico-Token): con secrets/diagnostico_webhook_token.
       - "Gemini Rayuela" (googlePalmApi): con secrets/gemini_api_key. Si ese archivo esta vacio se reutiliza la
         credencial que ya exista con ese nombre (por ejemplo, una cargada a mano desde la interfaz de n8n).
       - "SMTP Gmail Rayuela" (smtp): con N8N_SMTP_USER y N8N_SMTP_PASSWORD del .env. Si no estan, se reutiliza la
         credencial existente con ese nombre.
    2. Importa los flujos IA-01 (carga del manual), IA-02 (diagnostico con IA) e IA-03 (monitor de salud), les asigna
       las credenciales y carga el destinatario y el remitente de los correos (N8N_ALERT_EMAIL_TO / _FROM).
    3. Activa IA-02 (webhook) e IA-03 (monitor cada 30 s) solo si hay credencial SMTP: n8n no deja activar un flujo
       con una credencial sin asignar. Con --sin-activar-monitor IA-03 queda inactivo.

Requisitos:
    - Stack levantado (n8n y qdrant) y n8n con el usuario owner creado.
    - .env con N8N_LOGIN_EMAIL y N8N_LOGIN_PASSWORD (o N8N_BASIC_AUTH_USER / N8N_BASIC_AUTH_PASSWORD).
    - Secretos creados con "node scripts/init-secrets.js".
"""

from __future__ import annotations

import argparse
import copy
import sys
from pathlib import Path
from typing import Any

import bootstrap_fl1 as base

WORKFLOWS_DIR = base.REPO_ROOT / "n8n" / "workflows"
SECRETS_DIR = base.REPO_ROOT / "secrets"
ERROR_WORKFLOW_NAME = "N8N-00 - Registro de Errores"

CRED_GEMINI = "Gemini Rayuela"
CRED_QDRANT = "Qdrant Rayuela"
CRED_QDRANT_HDR = "Qdrant API Key Header"
CRED_DIAG = "Diagnostico Webhook Token"
CRED_SMTP = base.SMTP_CREDENTIAL  # "SMTP Gmail Rayuela"

DESTINO_PLACEHOLDER = "CAMBIAR_DESTINATARIO@ejemplo.com"
ORIGEN_PLACEHOLDER = "CAMBIAR_REMITENTE@ejemplo.com"

FLUJOS = {
    "carga": "10-ia-carga-manual-qdrant.json",
    "diagnostico": "11-ia-diagnostico-fallas-rag.json",
    "monitor": "12-ia-monitor-salud-plataforma.json",
}


def leer_secreto(nombre: str) -> str:
    ruta = SECRETS_DIR / nombre
    if not ruta.is_file():
        raise base.BootstrapError(
            f"No existe {ruta}. Crealo con: node scripts/init-secrets.js (solo crea los que faltan)."
        )
    return ruta.read_text(encoding="utf-8").strip()


def buscar_credencial(n8n: base.N8nClient, nombre: str, tipo: str) -> str | None:
    for c in n8n.list_credentials():
        if c.get("name") == nombre and c.get("type") == tipo:
            return c["id"]
    return None


def asignar_credenciales(flujo: dict[str, Any], ids: dict[str, str | None]) -> None:
    """Pone en cada nodo el id real de la credencial segun su tipo (y el nombre del nodo para los header auth)."""
    for nodo in flujo.get("nodes", []):
        creds = nodo.get("credentials") or {}
        for tipo in list(creds):
            if tipo == "googlePalmApi":
                clave, nombre = "gemini", CRED_GEMINI
            elif tipo == "qdrantApi":
                clave, nombre = "qdrant", CRED_QDRANT
            elif tipo == "smtp":
                clave, nombre = "smtp", CRED_SMTP
            elif tipo == "httpHeaderAuth":
                if nodo.get("name", "").startswith("Vaciar colecci"):
                    clave, nombre = "qdrant_hdr", CRED_QDRANT_HDR
                else:
                    clave, nombre = "diag", CRED_DIAG
            else:
                continue
            if ids.get(clave):
                creds[tipo] = {"id": ids[clave], "name": nombre}
            else:
                creds[tipo] = {"id": "", "name": nombre}  # queda sin asignar: se elige a mano en n8n


def cargar_correos(flujo: dict[str, Any], destino: str | None, origen: str | None) -> None:
    for nodo in flujo.get("nodes", []):
        if nodo.get("type") != "n8n-nodes-base.code":
            continue
        codigo = nodo.get("parameters", {}).get("jsCode", "")
        if destino:
            codigo = codigo.replace(DESTINO_PLACEHOLDER, destino)
        if origen:
            codigo = codigo.replace(ORIGEN_PLACEHOLDER, origen)
        nodo["parameters"]["jsCode"] = codigo


def importar(n8n: base.N8nClient, flujo: dict[str, Any], error_wf: str | None, activar: bool) -> str:
    """Crea o actualiza un flujo por nombre. Solo lo activa si se pide (la carga manual no se activa)."""
    preparado = copy.deepcopy(flujo)
    settings = dict(preparado.get("settings") or {})
    if error_wf:
        settings["errorWorkflow"] = error_wf
    payload = {
        "name": preparado["name"],
        "nodes": preparado.get("nodes", []),
        "connections": preparado.get("connections", {}),
        "settings": settings,
    }
    existente = next((w for w in n8n.list_workflows() if w.get("name") == payload["name"]), None)
    if existente:
        wid = existente["id"]
        actual = n8n.get_workflow(wid)
        if actual.get("active"):
            n8n.call("POST", f"/rest/workflows/{wid}/deactivate", {"versionId": actual.get("versionId")})
        n8n.call("PATCH", f"/rest/workflows/{wid}", payload)
        accion = "update"
    else:
        cuerpo = n8n.call("POST", "/rest/workflows", payload).json() or {}
        wid = (cuerpo.get("data") or {}).get("id")
        if not wid:
            raise base.BootstrapError(f"n8n no devolvio ID para {payload['name']}")
        accion = "create"
    if activar:
        version = n8n.get_workflow(wid).get("versionId")
        n8n.call("POST", f"/rest/workflows/{wid}/activate", {"versionId": version})
    print(f"[{accion}] Workflow n8n: {payload['name']} ({wid}){' [activo]' if activar else ' [inactivo]'}")
    return wid


def main() -> int:
    ap = argparse.ArgumentParser(description="Configura los flujos de diagnostico con IA en n8n.")
    ap.add_argument("--env-file", default=str(base.DEFAULT_ENV_FILE), help="Ruta al .env del proyecto")
    ap.add_argument("--n8n-url", default=None, help="URL de n8n")
    ap.add_argument("--sin-activar-monitor", action="store_true", help="Importa IA-03 sin activarlo")
    args = ap.parse_args()

    env = base.load_env(Path(args.env_file))
    n8n_url = args.n8n_url or base.env_value(env, "N8N_URL", base.DEFAULT_N8N_URL) or base.DEFAULT_N8N_URL
    email = base.env_value(env, "N8N_LOGIN_EMAIL") or base.env_value(env, "N8N_BASIC_AUTH_USER", required=True)
    password = base.env_value(env, "N8N_LOGIN_PASSWORD") or base.env_value(env, "N8N_BASIC_AUTH_PASSWORD", required=True)

    destino = base.env_value(env, "N8N_ALERT_EMAIL_TO")
    origen = base.env_value(env, "N8N_ALERT_EMAIL_FROM") or base.env_value(env, "N8N_SMTP_USER") or base.env_value(env, "EMAIL_USER")
    destino = None if base.is_placeholder(destino) else destino
    origen = None if base.is_placeholder(origen) else origen

    print("[info] Bootstrap de diagnostico con IA")
    print(f"[info] n8n: {n8n_url}")
    n8n = base.N8nClient(n8n_url, email, password)
    n8n.login()

    # ---- credenciales propias del stack (siempre se crean/actualizan)
    qdrant_key = leer_secreto("qdrant_api_key")
    ids: dict[str, str | None] = {
        "qdrant": n8n.ensure_credential(CRED_QDRANT, "qdrantApi", {"qdrantUrl": "http://qdrant:6333", "apiKey": qdrant_key}),
        "qdrant_hdr": n8n.ensure_credential(CRED_QDRANT_HDR, "httpHeaderAuth", {"name": "api-key", "value": qdrant_key}),
        "diag": n8n.ensure_credential(CRED_DIAG, "httpHeaderAuth", {"name": "X-Diagnostico-Token", "value": leer_secreto("diagnostico_webhook_token")}),
    }

    # ---- Gemini: del secreto, o la credencial que ya exista con ese nombre
    gemini_key = ""
    ruta_gemini = SECRETS_DIR / "gemini_api_key"
    if ruta_gemini.is_file():
        gemini_key = ruta_gemini.read_text(encoding="utf-8").strip()
    if gemini_key and not base.is_placeholder(gemini_key):
        ids["gemini"] = n8n.ensure_credential(CRED_GEMINI, "googlePalmApi", {"host": "https://generativelanguage.googleapis.com", "apiKey": gemini_key})
    else:
        ids["gemini"] = buscar_credencial(n8n, CRED_GEMINI, "googlePalmApi")
        print("[info] Gemini: " + ("se reutiliza la credencial existente" if ids["gemini"] else
              "SIN CLAVE (secrets/gemini_api_key esta vacio y no existe la credencial 'Gemini Rayuela'): cargala en n8n o en ese archivo y repeti el script"))

    # ---- SMTP: del .env, o la credencial existente
    smtp_user = base.env_value(env, "N8N_SMTP_USER") or base.env_value(env, "EMAIL_USER")
    smtp_pass = base.env_value(env, "N8N_SMTP_PASSWORD") or base.env_value(env, "EMAIL_PASS")
    if smtp_user and smtp_pass and not base.is_placeholder(smtp_user) and not base.is_placeholder(smtp_pass):
        ids["smtp"] = n8n.ensure_credential(CRED_SMTP, "smtp", {
            "user": smtp_user, "password": smtp_pass,
            "host": base.env_value(env, "N8N_SMTP_HOST", "smtp.gmail.com") or "smtp.gmail.com",
            "port": int(base.env_value(env, "N8N_SMTP_PORT", "465") or "465"),
            "secure": base.parse_bool(base.env_value(env, "N8N_SMTP_SECURE", "true"), True),
        })
    else:
        ids["smtp"] = buscar_credencial(n8n, CRED_SMTP, "smtp")
        print("[info] SMTP: " + ("se reutiliza la credencial existente" if ids["smtp"] else
              "SIN CREDENCIAL (definir N8N_SMTP_USER / N8N_SMTP_PASSWORD en .env, o crear 'SMTP Gmail Rayuela' en n8n)"))

    # ---- flujos
    error_wf = next((w for w in n8n.list_workflows() if w.get("name") == ERROR_WORKFLOW_NAME), None)
    error_id = error_wf["id"] if error_wf else None

    for clave, archivo in FLUJOS.items():
        flujo = base.read_json(WORKFLOWS_DIR / archivo)
        asignar_credenciales(flujo, ids)
        cargar_correos(flujo, destino, origen)
        if clave == "carga":
            activar = False                                  # disparador manual: no se activa
        elif clave == "monitor":
            activar = bool(ids.get("smtp")) and not args.sin_activar_monitor
        else:
            # IA-02 envia el correo: n8n no permite activar un flujo con una credencial SMTP sin asignar
            activar = bool(ids.get("smtp"))
        importar(n8n, flujo, error_id, activar)

    print("[ok] Bootstrap de diagnostico con IA completado")
    if not destino:
        print(f"[aviso] Falta N8N_ALERT_EMAIL_TO en .env: edita el destinatario ({DESTINO_PLACEHOLDER}) en el nodo "
              "'Validar y sanear' de IA-02 y 'Revisar plataforma' de IA-03.", file=sys.stderr)
    print("[info] Siguiente paso: en n8n abri 'IA-01 Carga del manual en Qdrant' y presiona 'Execute workflow'.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except base.BootstrapError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1)
    except KeyboardInterrupt:
        print("[error] Interrumpido", file=sys.stderr)
        raise SystemExit(130)
