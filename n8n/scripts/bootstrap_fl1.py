#!/usr/bin/env python3
"""
Bootstrap de N8N-01 Fl.1, Fl.2 y N8N-02 Fl.3.

Uso:
    python3 n8n/scripts/bootstrap_fl1.py
    python3 n8n/scripts/bootstrap_fl1.py --skip-grafana
    python3 n8n/scripts/bootstrap_fl1.py --skip-smtp
    python3 n8n/scripts/bootstrap_fl1.py --env-file .env

Requisitos:
    - Stack levantado (n8n, Grafana y MantisBT).
    - Archivo .env con las credenciales del proyecto.
    - n8n con el usuario owner ya creado.

El script es idempotente: crea o actualiza credenciales, workflows,
contact point y politica de Grafana. No imprime secretos.

Si EMAIL_USER/EMAIL_PASS (o N8N_SMTP_USER/N8N_SMTP_PASSWORD) tienen
placeholders, el bootstrap omite SMTP para no sobrescribir una credencial
existente. En una instancia nueva, define N8N_SMTP_* o crea la credencial
"SMTP Gmail Rayuela" manualmente.
"""

from __future__ import annotations

import argparse
import base64
import copy
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = REPO_ROOT / ".env"
DEFAULT_MAIN_WORKFLOW = REPO_ROOT / "n8n" / "workflows" / "01-alertas-infraestructura-mantisbt.json"
DEFAULT_BACKUP_WORKFLOW = REPO_ROOT / "n8n" / "workflows" / "02-verificacion-backups.json"
DEFAULT_ERROR_WORKFLOW = REPO_ROOT / "n8n" / "workflows" / "00-error-handler.json"
DEFAULT_INFORME_WORKFLOW = REPO_ROOT / "n8n" / "workflows" / "03-informe-ejecutivo-gemini.json"
DEFAULT_N8N_URL = "http://127.0.0.1:5678"
DEFAULT_GRAFANA_URL = "http://127.0.0.1:3001"
DEFAULT_INTERNAL_WEBHOOK_URL = "http://n8n:5678/webhook/grafana-alerta"
DEFAULT_CONTACT_POINT = "n8n"
PLACEHOLDER_VALUES = {
    "tu_correo@ejemplo.com",
    "destinatario@ejemplo.com",
    "tu_password_de_aplicacion",
    "tu_password",
    "tu_token_api_mantis",
    "changeme",
    "cambia_esta_credencial",
}

WEBHOOK_CREDENTIAL = "Grafana Webhook Basic Auth"
MANTIS_CREDENTIAL = "MantisBT API Token"
SMTP_CREDENTIAL = "SMTP Gmail Rayuela"
GEMINI_CREDENTIAL = "Gemini API Key"
NEXTCLOUD_CREDENTIAL = "Nextcloud WebDAV"


class BootstrapError(RuntimeError):
    pass


class HttpResponse:
    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body

    def json(self) -> Any:
        if not self.body:
            return None
        try:
            return json.loads(self.body)
        except json.JSONDecodeError as exc:
            raise BootstrapError(f"Respuesta no JSON: {self.body[:300]}") from exc


def load_env(path: Path) -> dict[str, str]:
    if not path.exists():
        raise BootstrapError(f"No existe el archivo .env: {path}")
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def env_value(
    env: dict[str, str],
    key: str,
    default: str | None = None,
    required: bool = False,
) -> str | None:
    value = env.get(key)
    if value is None or value == "":
        if required:
            raise BootstrapError(f"Falta la variable {key} en .env")
        return default
    return value


def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "si", "sí", "on")


def is_placeholder(value: str | None) -> bool:
    if value is None:
        return True
    return value.strip().lower() in PLACEHOLDER_VALUES


def join_url(base: str, path: str) -> str:
    return base.rstrip("/") + "/" + path.lstrip("/")


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise BootstrapError(f"No existe el archivo: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise BootstrapError(f"JSON invalido en {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise BootstrapError(f"El workflow {path} no contiene un objeto JSON")
    return data


def request(
    opener: urllib.request.OpenerDirector,
    method: str,
    url: str,
    payload: Any | None = None,
    headers: dict[str, str] | None = None,
) -> HttpResponse:
    body = None
    request_headers = {"Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with opener.open(req, timeout=30) as resp:
            return HttpResponse(resp.status, resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        return HttpResponse(exc.code, body_text)
    except urllib.error.URLError as exc:
        raise BootstrapError(f"No se pudo conectar con {url}: {exc.reason}") from exc


class N8nClient:
    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookies)
        )

    def call(
        self,
        method: str,
        path: str,
        payload: Any | None = None,
        expected: tuple[int, ...] = (200, 201, 202),
    ) -> HttpResponse:
        response = request(self.opener, method, join_url(self.base_url, path), payload)
        if response.status not in expected:
            raise BootstrapError(
                f"n8n {method} {path} devolvio {response.status}: {response.body[:500]}"
            )
        return response

    def login(self) -> None:
        response = self.call(
            "POST",
            "/rest/login",
            {"emailOrLdapLoginId": self.email, "password": self.password},
        )
        if response.status != 200:
            raise BootstrapError(
                f"Login en n8n fallo ({response.status}). Revisa N8N_BASIC_AUTH_USER/PASSWORD."
            )
        auth_cookie = next(
            (cookie for cookie in self.cookies if cookie.name == "n8n-auth"),
            None,
        )
        if not auth_cookie:
            raise BootstrapError("Login en n8n no devolvio la cookie n8n-auth")
        auth_cookie.secure = False
        print("[ok] Login en n8n")

    def list_credentials(self) -> list[dict[str, Any]]:
        data = self.call("GET", "/rest/credentials").json()
        if isinstance(data, dict):
            data = data.get("data", [])
        return data if isinstance(data, list) else []

    def ensure_credential(self, name: str, credential_type: str, data: dict[str, Any]) -> str:
        existing = next(
            (
                credential
                for credential in self.list_credentials()
                if credential.get("name") == name and credential.get("type") == credential_type
            ),
            None,
        )
        payload = {"name": name, "type": credential_type, "data": data}
        if existing:
            credential_id = existing["id"]
            try:
                self.call("PATCH", f"/rest/credentials/{credential_id}", payload)
                print(f"[update] Credencial n8n: {name}")
            except BootstrapError as exc:
                print(
                    f"[warn] No se pudo actualizar la credencial {name}: {exc}",
                    file=sys.stderr,
                )
            return credential_id
        response = self.call("POST", "/rest/credentials", payload)
        body = response.json() or {}
        credential_id = (body.get("data") or {}).get("id")
        if not credential_id:
            raise BootstrapError(f"n8n no devolvio ID para la credencial {name}")
        print(f"[create] Credencial n8n: {name}")
        return credential_id

    def list_workflows(self) -> list[dict[str, Any]]:
        data = self.call("GET", "/rest/workflows?limit=250").json()
        if isinstance(data, dict):
            data = data.get("data") or data.get("results", [])
        return data if isinstance(data, list) else []

    def get_workflow(self, workflow_id: str) -> dict[str, Any]:
        body = self.call("GET", f"/rest/workflows/{workflow_id}").json() or {}
        workflow = body.get("data")
        if not isinstance(workflow, dict):
            raise BootstrapError(f"n8n no devolvio el workflow {workflow_id}")
        return workflow

    def ensure_workflow(
        self,
        workflow: dict[str, Any],
        error_workflow_id: str | None = None,
    ) -> str:
        prepared = copy.deepcopy(workflow)
        settings = dict(prepared.get("settings") or {})
        if error_workflow_id:
            settings["errorWorkflow"] = error_workflow_id
        payload = {
            "name": prepared.get("name"),
            "nodes": prepared.get("nodes", []),
            "connections": prepared.get("connections", {}),
            "settings": settings,
        }
        if not payload["name"]:
            raise BootstrapError("El workflow no tiene nombre")

        existing = next(
            (item for item in self.list_workflows() if item.get("name") == payload["name"]),
            None,
        )
        if existing:
            workflow_id = existing["id"]
            current = self.get_workflow(workflow_id)
            if current.get("active"):
                self.call(
                    "POST",
                    f"/rest/workflows/{workflow_id}/deactivate",
                    {"versionId": current.get("versionId")},
                )
            self.call("PATCH", f"/rest/workflows/{workflow_id}", payload)
            current = self.get_workflow(workflow_id)
            self.call(
                "POST",
                f"/rest/workflows/{workflow_id}/activate",
                {"versionId": current.get("versionId")},
            )
            print(f"[update] Workflow n8n: {payload['name']} ({workflow_id})")
            return workflow_id

        response = self.call("POST", "/rest/workflows", payload)
        body = response.json() or {}
        created = body.get("data") or {}
        workflow_id = created.get("id")
        if not workflow_id:
            raise BootstrapError(f"n8n no devolvio ID para el workflow {payload['name']}")
        version_id = created.get("versionId")
        if not version_id:
            version_id = self.get_workflow(workflow_id).get("versionId")
        self.call(
            "POST",
            f"/rest/workflows/{workflow_id}/activate",
            {"versionId": version_id},
        )
        print(f"[create] Workflow n8n: {payload['name']} ({workflow_id})")
        return workflow_id


class GrafanaClient:
    def __init__(self, base_url: str, user: str, password: str):
        self.base_url = base_url.rstrip("/")
        token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
        self.headers = {"Authorization": f"Basic {token}"}
        self.opener = urllib.request.build_opener()

    def call(
        self,
        method: str,
        path: str,
        payload: Any | None = None,
        expected: tuple[int, ...] = (200, 201, 202),
    ) -> HttpResponse:
        response = request(
            self.opener,
            method,
            join_url(self.base_url, path),
            payload,
            headers=self.headers,
        )
        if response.status not in expected:
            raise BootstrapError(
                f"Grafana {method} {path} devolvio {response.status}: {response.body[:500]}"
            )
        return response

    def ensure_contact_point(self, name: str, url: str, user: str, password: str) -> str:
        response = self.call("GET", "/api/v1/provisioning/contact-points")
        contact_points = response.json() or []
        if not isinstance(contact_points, list):
            contact_points = []
        existing = next((item for item in contact_points if item.get("name") == name), None)
        payload = {
            "name": name,
            "type": "webhook",
            "settings": {
                "url": url,
                "httpMethod": "POST",
                "username": user,
                "password": password,
            },
            "disableResolveMessage": False,
        }
        if existing:
            uid = existing.get("uid")
            if not uid:
                raise BootstrapError(f"El contact point {name} no tiene uid")
            self.call("PUT", f"/api/v1/provisioning/contact-points/{uid}", payload)
            print(f"[update] Contact point Grafana: {name}")
            return uid
        response = self.call("POST", "/api/v1/provisioning/contact-points", payload)
        body = response.json() or {}
        uid = body.get("uid")
        if not uid:
            raise BootstrapError(f"Grafana no devolvio uid para el contact point {name}")
        print(f"[create] Contact point Grafana: {name}")
        return uid

    def ensure_policy(self, receiver: str) -> None:
        response = self.call("GET", "/api/v1/provisioning/policies")
        policy = response.json() or {}
        if not isinstance(policy, dict):
            raise BootstrapError("Grafana devolvio una politica invalida")
        policy.pop("provenance", None)
        policy["receiver"] = receiver
        self.call("PUT", "/api/v1/provisioning/policies", policy)
        print(f"[update] Politica de Grafana -> receiver {receiver}")


def apply_node_credentials(
    workflow: dict[str, Any],
    webhook_credential_id: str,
    mantis_credential_id: str,
    smtp_credential_id: str | None,
    gemini_credential_id: str | None = None,
    nextcloud_credential_id: str | None = None,
) -> None:
    for node in workflow.get("nodes", []):
        name = node.get("name")
        if name == "Webhook Grafana Alertas":
            credentials = node.setdefault("credentials", {})
            credentials["httpBasicAuth"] = {
                "id": webhook_credential_id,
                "name": WEBHOOK_CREDENTIAL,
            }
        elif name == "Crear Ticket MantisBT":
            credentials = node.setdefault("credentials", {})
            credentials["httpHeaderAuth"] = {
                "id": mantis_credential_id,
                "name": MANTIS_CREDENTIAL,
            }
        elif node.get("type") == "n8n-nodes-base.emailSend" and smtp_credential_id:
            credentials = node.setdefault("credentials", {})
            credentials["smtp"] = {
                "id": smtp_credential_id,
                "name": SMTP_CREDENTIAL,
            }
        elif name == "Generar Informe":
            credentials = node.setdefault("credentials", {})
            credentials["httpHeaderAuth"] = {
                "id": gemini_credential_id,
                "name": GEMINI_CREDENTIAL,
            }
        elif name == "Guardar Informe":
            credentials = node.setdefault("credentials", {})
            credentials["httpBasicAuth"] = {
                "id": nextcloud_credential_id,
                "name": NEXTCLOUD_CREDENTIAL,
            }


def apply_mantis_config(
    workflow: dict[str, Any],
    project_id: int,
    category_id: int,
) -> None:
    for node in workflow.get("nodes", []):
        if node.get("name") != "Crear Ticket MantisBT":
            continue
        parameters = node.setdefault("parameters", {})
        parameters["jsonBody"] = (
            "={{ JSON.stringify({ summary: $json.summary, description: $json.description, "
            f"project: {{ id: {project_id} }}, category: {{ id: {category_id} }}, "
            "priority: { id: $json.priorityId }, severity: { id: $json.severityId } }) }}"
        )


def apply_email_config(
    workflow: dict[str, Any],
    from_email: str | None,
    to_email: str | None,
) -> None:
    if not from_email and not to_email:
        return
    for node in workflow.get("nodes", []):
        if node.get("type") != "n8n-nodes-base.emailSend":
            continue
        parameters = node.setdefault("parameters", {})
        if from_email:
            parameters["fromEmail"] = from_email
        if to_email:
            parameters["toEmail"] = to_email


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Configura credenciales, workflows y Grafana para N8N-01 Fl.1 y Fl.2."
    )
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Ruta al .env del proyecto (default: .env en la raiz del repo)",
    )
    parser.add_argument("--n8n-url", default=None, help="URL de n8n")
    parser.add_argument("--grafana-url", default=None, help="URL de Grafana")
    parser.add_argument(
        "--main-workflow",
        default=str(DEFAULT_MAIN_WORKFLOW),
        help="JSON del workflow Fl.1",
    )
    parser.add_argument(
        "--backup-workflow",
        default=str(DEFAULT_BACKUP_WORKFLOW),
        help="JSON del workflow Fl.2",
    )
    parser.add_argument(
        "--error-workflow",
        default=str(DEFAULT_ERROR_WORKFLOW),
        help="JSON del workflow de errores",
    )
    parser.add_argument(
        "--informe-workflow",
        default=str(DEFAULT_INFORME_WORKFLOW),
        help="JSON del workflow Fl.3 (informe ejecutivo con Gemini)",
    )
    parser.add_argument("--skip-grafana", action="store_true", help="No configurar Grafana")
    parser.add_argument("--skip-smtp", action="store_true", help="No configurar SMTP")
    args = parser.parse_args()

    env = load_env(Path(args.env_file))
    n8n_url = args.n8n_url or env_value(env, "N8N_URL", DEFAULT_N8N_URL) or DEFAULT_N8N_URL
    grafana_url = (
        args.grafana_url
        or env_value(env, "GRAFANA_URL", DEFAULT_GRAFANA_URL)
        or DEFAULT_GRAFANA_URL
    )

    n8n_email = env_value(env, "N8N_LOGIN_EMAIL") or env_value(
        env, "N8N_BASIC_AUTH_USER", required=True
    )
    n8n_password = env_value(env, "N8N_LOGIN_PASSWORD") or env_value(
        env, "N8N_BASIC_AUTH_PASSWORD", required=True
    )
    webhook_user = env_value(env, "N8N_WEBHOOK_BASIC_AUTH_USER", required=True)
    webhook_password = env_value(env, "N8N_WEBHOOK_BASIC_AUTH_PASSWORD", required=True)
    mantis_token = env_value(env, "MANTIS_API_TOKEN", required=True)
    if is_placeholder(webhook_user) or is_placeholder(webhook_password):
        raise BootstrapError(
            "N8N_WEBHOOK_BASIC_AUTH_USER/PASSWORD tienen placeholders. "
            "Define credenciales reales antes de ejecutar el bootstrap."
        )
    if is_placeholder(mantis_token):
        raise BootstrapError(
            "MANTIS_API_TOKEN tiene un placeholder. Define el token real antes de ejecutar el bootstrap."
        )
    gemini_api_key = env_value(env, "GEMINI_API_KEY")
    nextcloud_user = env_value(env, "N8N_NEXTCLOUD_USER", "admin")
    nextcloud_password = env_value(env, "N8N_NEXTCLOUD_PASSWORD")

    project_id = int(env_value(env, "MANTIS_PROJECT_ID", "1") or "1")
    category_id = int(env_value(env, "MANTIS_CATEGORY_ID", "1") or "1")
    internal_webhook_url = (
        env_value(env, "N8N_INTERNAL_WEBHOOK_URL", DEFAULT_INTERNAL_WEBHOOK_URL)
        or DEFAULT_INTERNAL_WEBHOOK_URL
    )
    contact_point = (
        env_value(env, "GRAFANA_CONTACT_POINT_NAME", DEFAULT_CONTACT_POINT)
        or DEFAULT_CONTACT_POINT
    )

    smtp_user = env_value(env, "N8N_SMTP_USER") or env_value(env, "EMAIL_USER")
    smtp_password = env_value(env, "N8N_SMTP_PASSWORD") or env_value(env, "EMAIL_PASS")
    smtp_host = env_value(env, "N8N_SMTP_HOST", "smtp.gmail.com") or "smtp.gmail.com"
    smtp_port = int(env_value(env, "N8N_SMTP_PORT", "465") or "465")
    smtp_secure = parse_bool(env_value(env, "N8N_SMTP_SECURE", "true"), True)
    smtp_configured = bool(
        smtp_user
        and smtp_password
        and not is_placeholder(smtp_user)
        and not is_placeholder(smtp_password)
    )

    from_email = env_value(env, "N8N_ALERT_EMAIL_FROM")
    to_email = env_value(env, "N8N_ALERT_EMAIL_TO")
    if is_placeholder(from_email):
        from_email = None
    if is_placeholder(to_email):
        to_email = None
    if smtp_configured:
        from_email = from_email or smtp_user
        to_email = to_email or smtp_user

    print("[info] Bootstrap N8N-01 Fl.1 y Fl.2")
    print(f"[info] n8n: {n8n_url}")
    print(f"[info] Grafana: {grafana_url}")
    print(f"[info] Workflow principal: {args.main_workflow}")
    print(f"[info] Workflow Fl.2: {args.backup_workflow}")
    print(f"[info] Workflow de errores: {args.error_workflow}")

    n8n = N8nClient(n8n_url, n8n_email, n8n_password)
    n8n.login()

    webhook_credential_id = n8n.ensure_credential(
        WEBHOOK_CREDENTIAL,
        "httpBasicAuth",
        {"user": webhook_user, "password": webhook_password},
    )
    mantis_credential_id = n8n.ensure_credential(
        MANTIS_CREDENTIAL,
        "httpHeaderAuth",
        {"name": "Authorization", "value": mantis_token},
    )

    gemini_credential_id: str | None = None
    if gemini_api_key and not is_placeholder(gemini_api_key):
        gemini_credential_id = n8n.ensure_credential(
            GEMINI_CREDENTIAL,
            "httpHeaderAuth",
            {"name": "x-goog-api-key", "value": gemini_api_key},
        )
    else:
        print(
            "[warn] GEMINI_API_KEY no definida o tiene placeholder: no se crea la credencial Gemini API Key",
            file=sys.stderr,
        )
        existing_gemini = next(
            (
                credential
                for credential in n8n.list_credentials()
                if credential.get("name") == GEMINI_CREDENTIAL
                and credential.get("type") == "httpHeaderAuth"
            ),
            None,
        )
        if existing_gemini:
            gemini_credential_id = existing_gemini["id"]
            print("[info] Gemini: se reutiliza la credencial existente sin modificarla")

    nextcloud_credential_id: str | None = None
    if nextcloud_password:
        nextcloud_credential_id = n8n.ensure_credential(
            NEXTCLOUD_CREDENTIAL,
            "httpBasicAuth",
            {"user": nextcloud_user, "password": nextcloud_password},
        )
    else:
        print(
            "[warn] N8N_NEXTCLOUD_PASSWORD no definida: no se crea la credencial Nextcloud WebDAV",
            file=sys.stderr,
        )

    smtp_credential_id: str | None = None
    if args.skip_smtp:
        print("[skip] Credencial SMTP (--skip-smtp)", file=sys.stderr)
    elif not smtp_configured:
        print(
            "[warn] No se configura SMTP: N8N_SMTP_USER/PASSWORD o EMAIL_USER/PASS "
            "no estan definidos o tienen placeholders. Se conserva la credencial existente; "
            "en una instancia nueva, crea 'SMTP Gmail Rayuela' manualmente o define N8N_SMTP_*.",
            file=sys.stderr,
        )
    else:
        smtp_credential_id = n8n.ensure_credential(
            SMTP_CREDENTIAL,
            "smtp",
            {
                "user": smtp_user,
                "password": smtp_password,
                "host": smtp_host,
                "port": smtp_port,
                "secure": smtp_secure,
            },
        )

    if smtp_credential_id is None:
        existing_smtp = next(
            (
                credential
                for credential in n8n.list_credentials()
                if credential.get("name") == SMTP_CREDENTIAL
                and credential.get("type") == "smtp"
            ),
            None,
        )
        if existing_smtp:
            smtp_credential_id = existing_smtp["id"]
            print("[info] SMTP: se reutiliza la credencial existente sin modificarla")

    main_workflow = read_json(Path(args.main_workflow))
    backup_workflow = read_json(Path(args.backup_workflow))
    error_workflow = read_json(Path(args.error_workflow))
    informe_workflow = read_json(Path(args.informe_workflow))

    apply_node_credentials(
        main_workflow,
        webhook_credential_id,
        mantis_credential_id,
        smtp_credential_id,
    )
    apply_mantis_config(main_workflow, project_id, category_id)
    apply_email_config(main_workflow, from_email, to_email)

    apply_node_credentials(
        backup_workflow,
        webhook_credential_id,
        mantis_credential_id,
        smtp_credential_id,
    )
    apply_email_config(backup_workflow, from_email, to_email)

    apply_node_credentials(
        informe_workflow,
        webhook_credential_id,
        mantis_credential_id,
        smtp_credential_id,
        gemini_credential_id=gemini_credential_id,
        nextcloud_credential_id=nextcloud_credential_id,
    )
    apply_email_config(informe_workflow, from_email, to_email)

    error_workflow_id = n8n.ensure_workflow(error_workflow)
    main_workflow_id = n8n.ensure_workflow(
        main_workflow,
        error_workflow_id=error_workflow_id,
    )
    backup_workflow_id = n8n.ensure_workflow(
        backup_workflow,
        error_workflow_id=error_workflow_id,
    )
    informe_workflow_id = n8n.ensure_workflow(
        informe_workflow,
        error_workflow_id=error_workflow_id,
    )

    if args.skip_grafana:
        print("[skip] Grafana (--skip-grafana)", file=sys.stderr)
    else:
        grafana_user = env_value(env, "GRAFANA_ADMIN_USER", "admin") or "admin"
        grafana_password = (
            env_value(env, "GRAFANA_ADMIN_PASSWORD", "admin123") or "admin123"
        )
        grafana = GrafanaClient(grafana_url, grafana_user, grafana_password)
        grafana.ensure_contact_point(
            contact_point,
            internal_webhook_url,
            webhook_user,
            webhook_password,
        )
        grafana.ensure_policy(contact_point)

    print("[ok] Bootstrap completado")
    print(f"[info] Workflow Fl.1: {main_workflow_id}")
    print(f"[info] Workflow Fl.2: {backup_workflow_id}")
    print(f"[info] Workflow Fl.3: {informe_workflow_id}")
    print(f"[info] Workflow errores: {error_workflow_id}")
    print(f"[info] Contact point: {contact_point}")
    print("[info] Probar: Grafana -> Alerting -> Contact points -> n8n -> Test")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BootstrapError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        raise SystemExit(1)
    except KeyboardInterrupt:
        print("[error] Interrumpido", file=sys.stderr)
        raise SystemExit(130)
