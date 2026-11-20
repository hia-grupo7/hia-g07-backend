#!/usr/bin/env python3
"""
Bootstrap del flujo del honeypot (SEC-02 / CARD-21).

Uso:
    python3 n8n/scripts/bootstrap_honeypot.py
    python3 n8n/scripts/bootstrap_honeypot.py --env-file .env --token-file secrets/honeypot_webhook_token

Que hace (idempotente, no imprime secretos):
    - Crea o actualiza en n8n la credencial "Honeypot Webhook Token" (Header Auth, cabecera
      X-Honeypot-Token) con el valor del Docker Secret secrets/honeypot_webhook_token: el mismo
      que usa el backend para llamar al webhook.
    - Reutiliza la credencial "MantisBT API Token" (la deja bootstrap_fl1.py).
    - Importa y activa el workflow 03-honeypot-intrusion-mantisbt.json.

Requisitos:
    - Stack levantado (n8n y MantisBT) y n8n con el usuario owner creado.
    - Recomendado: bootstrap_fl1.py ya ejecutado una vez (crea el workflow de errores global; si
      no existe, el flujo del honeypot se importa igual, sin ese workflow de errores).
    - secrets/honeypot_webhook_token creado con "node scripts/init-secrets.js".
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import bootstrap_fl1 as base

DEFAULT_WORKFLOW = base.REPO_ROOT / "n8n" / "workflows" / "03-honeypot-intrusion-mantisbt.json"
DEFAULT_TOKEN_FILE = base.REPO_ROOT / "secrets" / "honeypot_webhook_token"
ERROR_WORKFLOW_NAME = "N8N-00 - Registro de Errores"
HONEYPOT_CREDENTIAL = "Honeypot Webhook Token"
HONEYPOT_HEADER = "X-Honeypot-Token"


def read_token(path: Path) -> str:
    if not path.is_file():
        raise base.BootstrapError(
            f"No existe {path}. Crealo con: node scripts/init-secrets.js "
            "(solo crea los archivos que faltan)."
        )
    token = path.read_text(encoding="utf-8").strip()
    if not token:
        raise base.BootstrapError(f"{path} esta vacio.")
    return token


def apply_credentials(
    workflow: dict[str, Any], honeypot_credential_id: str, mantis_credential_id: str
) -> None:
    for node in workflow.get("nodes", []):
        name = node.get("name")
        if name == "Webhook Honeypot":
            node.setdefault("credentials", {})["httpHeaderAuth"] = {
                "id": honeypot_credential_id,
                "name": HONEYPOT_CREDENTIAL,
            }
        elif name == "Crear Ticket MantisBT":
            node.setdefault("credentials", {})["httpHeaderAuth"] = {
                "id": mantis_credential_id,
                "name": base.MANTIS_CREDENTIAL,
            }


def apply_mantis_config(workflow: dict[str, Any], project_id: int, category: str | None) -> None:
    for node in workflow.get("nodes", []):
        if node.get("name") != "Crear Ticket MantisBT":
            continue
        body = node.setdefault("parameters", {}).get("jsonBody", "")
        body = body.replace("project: { id: 1 }", f"project: {{ id: {project_id} }}")
        if category:
            body = body.replace("category: { name: 'Seguridad & Accesos' }", f"category: {{ name: {category!r} }}")
        node["parameters"]["jsonBody"] = body


def main() -> int:
    parser = argparse.ArgumentParser(description="Configura el flujo del honeypot (SEC-02) en n8n.")
    parser.add_argument("--env-file", default=str(base.DEFAULT_ENV_FILE), help="Ruta al .env del proyecto")
    parser.add_argument("--token-file", default=str(DEFAULT_TOKEN_FILE), help="Archivo del Docker Secret del token")
    parser.add_argument("--workflow", default=str(DEFAULT_WORKFLOW), help="JSON del workflow del honeypot")
    parser.add_argument("--n8n-url", default=None, help="URL de n8n")
    parser.add_argument(
        "--category",
        default=None,
        help="Categoria de Mantis para el incidente (por defecto 'Seguridad & Accesos')",
    )
    args = parser.parse_args()

    env = base.load_env(Path(args.env_file))
    n8n_url = args.n8n_url or base.env_value(env, "N8N_URL", base.DEFAULT_N8N_URL) or base.DEFAULT_N8N_URL
    n8n_email = base.env_value(env, "N8N_LOGIN_EMAIL") or base.env_value(
        env, "N8N_BASIC_AUTH_USER", required=True
    )
    n8n_password = base.env_value(env, "N8N_LOGIN_PASSWORD") or base.env_value(
        env, "N8N_BASIC_AUTH_PASSWORD", required=True
    )
    mantis_token = base.env_value(env, "MANTIS_API_TOKEN", required=True)
    if base.is_placeholder(mantis_token):
        raise base.BootstrapError("MANTIS_API_TOKEN tiene un placeholder. Define el token real.")
    project_id = int(base.env_value(env, "MANTIS_PROJECT_ID", "1") or "1")
    token = read_token(Path(args.token_file))

    print("[info] Bootstrap SEC-02 (honeypot)")
    print(f"[info] n8n: {n8n_url}")
    print(f"[info] Workflow: {args.workflow}")

    n8n = base.N8nClient(n8n_url, n8n_email, n8n_password)
    n8n.login()

    honeypot_credential_id = n8n.ensure_credential(
        HONEYPOT_CREDENTIAL, "httpHeaderAuth", {"name": HONEYPOT_HEADER, "value": token}
    )
    mantis_credential_id = n8n.ensure_credential(
        base.MANTIS_CREDENTIAL, "httpHeaderAuth", {"name": "Authorization", "value": mantis_token}
    )

    error_workflow = next(
        (item for item in n8n.list_workflows() if item.get("name") == ERROR_WORKFLOW_NAME), None
    )
    if not error_workflow:
        print(
            f"[aviso] No existe el workflow '{ERROR_WORKFLOW_NAME}' (lo crea bootstrap_fl1.py): "
            "el flujo del honeypot queda sin workflow de errores global.",
            file=sys.stderr,
        )

    workflow = base.read_json(Path(args.workflow))
    apply_credentials(workflow, honeypot_credential_id, mantis_credential_id)
    apply_mantis_config(workflow, project_id, args.category)
    workflow_id = n8n.ensure_workflow(
        workflow, error_workflow_id=error_workflow["id"] if error_workflow else None
    )

    print("[ok] Bootstrap del honeypot completado")
    print(f"[info] Workflow honeypot: {workflow_id}")
    print("[info] Probar: curl -X POST http://localhost/api/admin/reset-all")
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
