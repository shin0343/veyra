"""Durable runs and action receipts. No database transaction spans a model request."""

import hashlib
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb
from pydantic import ValidationError

from . import agent_models as a
from . import agent_tools as t
from . import contracts as c
from . import store
from .db import Problem

logger = logging.getLogger("veyra")


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


def error_detail(code, message, retryable=False):
    return c.ErrorDetail(code=code, message=message, retryable=retryable)


def failed(call, error):
    return {
        "action": c.ActionFailed(
            tool_call_id=call.id, tool_name=call.function.name, error=error
        ).model_dump(mode="json"),
        "data": {"error": error.model_dump(mode="json")},
        "navigation": [],
    }


def response_for(run, envelopes, error=None, verified=None):
    actions = [envelope["action"] for envelope in envelopes]
    pending = next(
        (
            item.get("proposal")
            for item in envelopes
            if item.get("proposal") and item["action"]["status"] == "confirmation_required"
        ),
        None,
    )
    errors = [item["error"] for item in actions if item["status"] == "failed"]
    if error:
        errors.append(error.model_dump(mode="json"))
    navigation = [
        nav
        for item in envelopes
        if item["action"]["status"] == "succeeded"
        for nav in item.get("navigation", [])
    ]
    executed = [
        item
        for item in actions
        if item["status"] == "succeeded" and item["tool_name"] == "layouts.create"
    ]
    if pending:
        status, message = (
            "awaiting_confirmation",
            (
                "Review the camera names and arrangement, then approve to save. No "
                "layout has been created."
            ),
        )
    elif errors:
        status, message = (
            "failed",
            "The request was not fully completed. " + " ".join(item["message"] for item in errors),
        )
    else:
        status = "completed"
        message = " ".join(
            dict.fromkeys(item["message"] for item in actions if item["status"] == "succeeded")
        )
        if not message:
            message = (
                "No VMS action was executed. Identity recognition is unsupported. "
                "Available functions include camera settings, live camera navigation, "
                "recordings and saved layouts."
            )
    candidates = [
        candidate for item in envelopes for candidate in item["data"].get("candidates", [])
    ]
    clarification = None
    # A camera-list receipt is not completion of a requested layout. Build the next step
    # from actual tool data; model prose never becomes a write receipt or permission.
    layout_intent = re.search(
        r"(?:creat|mak|assembl|sav|arrang|build)\w*.*(?:view|layout)|(?:뷰|레이아웃).*만들",
        run.get("user_message", ""),
        re.IGNORECASE,
    )
    if layout_intent and not pending and not executed and not errors:
        candidates = [
            camera
            for item in envelopes
            if item["action"]["tool_name"] == "cameras.list"
            for camera in item["data"].get("items", [])
            if camera["enabled"]
        ]
        clarification = (
            "Choose the cameras for this view and give it a name. "
            "The available cameras are listed below; choosing one fills your message. "
            "Submit the complete request, then review the proposal before saving."
            if candidates
            else "There are no available cameras for this view. Connect or enable a camera first."
        )
        message = clarification
    if verified:
        outcome = "completed_verified"
    elif executed:
        outcome = "committed_unverified"
    elif pending:
        outcome = "awaiting_confirmation"
    elif errors and all(item["code"] == "USER_DECLINED" for item in errors):
        outcome = "rejected"
    elif errors and all(item["code"] == "CONFIRMATION_EXPIRED" for item in errors):
        outcome = "cancelled"
    elif errors:
        outcome = "failed"
    elif clarification:
        outcome = "clarification_required"
    else:
        outcome = "answered"
    return a.AgentResponse(
        conversation_id=run["conversation_id"],
        run_id=run["id"],
        status=status,
        interaction_state=outcome,
        clarification=clarification,
        message=message,
        actions=actions,
        suggested_actions=navigation,
        navigation_target=navigation[-1]["target"] if navigation else None,
        confirmation_request=pending,
        executed_operations=executed,
        verified_results=verified or [],
        errors=errors,
        camera_candidates=candidates,
    ).model_dump(mode="json")


class AgentStore:
    def __init__(self, database, settings=None):
        self.settings = settings
        self.database = database

    @staticmethod
    def audit(db, principal, operation, resource_id):
        db.execute(
            "INSERT INTO vms_audit(id,principal_id,operation,resource_id) VALUES (%s,%s,%s,%s)",
            (uuid4(), principal, operation, resource_id),
        )

    @staticmethod
    def envelopes(db, run_id):
        return [
            row["result"]
            for row in db.execute(
                (
                    "SELECT result FROM agent_actions WHERE run_id=%s AND result IS NOT "
                    "NULL ORDER BY created_at,id"
                ),
                (run_id,),
            ).fetchall()
        ]

    def _existing_request(self, db, principal, key, body):
        db.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
            (f"agent:{principal}:{key}",),
        )
        db.execute(
            (
                "DELETE FROM agent_requests WHERE principal_id=%s AND "
                "operation='sendAgentMessage' AND key=%s AND "
                "created_at<=now()-interval '24 hours'"
            ),
            (principal, key),
        )
        old = db.execute(
            (
                "SELECT * FROM agent_requests WHERE principal_id=%s AND "
                "operation='sendAgentMessage' AND key=%s"
            ),
            (principal, key),
        ).fetchone()
        if not old:
            return None, None
        if old["request_sha256"] != fingerprint(body.model_dump(mode="json")):
            raise Problem(
                409,
                "IDEMPOTENCY_CONFLICT",
                "This request key was already used with different input.",
            )
        run = db.execute(
            "SELECT * FROM agent_runs WHERE id=%s FOR UPDATE", (old["run_id"],)
        ).fetchone()
        if old["response_body"]:
            return run, old["response_body"]
        if run["state"] == "awaiting_confirmation" or run["deadline_at"] <= datetime.now(
            timezone.utc
        ):
            error = (
                None
                if run["state"] == "awaiting_confirmation"
                else error_detail(
                    "AGENT_INTERRUPTED",
                    "The previous run ended without a final response. No model work was restarted.",
                    True,
                )
            )
            response = response_for(run, self.envelopes(db, run["id"]), error)
            self.finish_in(db, run["id"], response)
            return run, response
        raise Problem(
            409,
            "AGENT_RUN_IN_PROGRESS",
            "This request is already running; retry with the same key.",
            True,
        )

    def replay(self, principal, key, body):
        """Recover durable receipts without requiring a model client or starting new work."""
        with self.database.connect() as db:
            return self._existing_request(db, principal, key, body)[1]

    def begin(self, principal, key, body, model):
        payload = body.model_dump(mode="json")
        with self.database.connect() as db:
            run, cached = self._existing_request(db, principal, key, body)
            if run is not None:
                return run, cached
            if (
                body.conversation_id
                and not db.execute(
                    "SELECT 1 FROM agent_runs WHERE conversation_id=%s AND principal_id=%s",
                    (body.conversation_id, principal),
                ).fetchone()
            ):
                raise Problem(404, "NOT_FOUND", "This conversation is not available.")
            run = db.execute(
                """INSERT INTO agent_runs
                (id,conversation_id,principal_id,state,model_id,user_message,deadline_at)
                VALUES (%s,%s,%s,'running',%s,%s,now()+interval '60 seconds') RETURNING *""",
                (uuid4(), body.conversation_id or uuid4(), principal, model, body.message),
            ).fetchone()
            db.execute(
                (
                    "INSERT INTO "
                    "agent_requests(principal_id,operation,key,request_sha256,run_id) "
                    "VALUES (%s,'sendAgentMessage',%s,%s,%s)"
                ),
                (principal, key, fingerprint(payload), run["id"]),
            )
            self.audit(db, principal, "agent.run.started", run["id"])
            return run, None

    @staticmethod
    def finish_in(db, run_id, response):
        db.execute(
            "UPDATE agent_runs SET state=%s,response_body=%s WHERE id=%s",
            (response["status"], Jsonb(response), run_id),
        )
        db.execute(
            "UPDATE agent_requests SET response_body=%s WHERE run_id=%s AND response_body IS NULL",
            (Jsonb(response), run_id),
        )

    def finish(self, run, envelopes, error=None):
        response = response_for(run, envelopes, error)
        with self.database.connect() as db:
            current = db.execute(
                "SELECT * FROM agent_runs WHERE id=%s FOR UPDATE", (run["id"],)
            ).fetchone()
            original = db.execute(
                "SELECT response_body FROM agent_requests WHERE run_id=%s", (run["id"],)
            ).fetchone()
            if original and original["response_body"]:
                # A retry can recover/approve a proposal before the original request
                # finishes. Preserve both the original receipt and the newer run state.
                return original["response_body"]
            if current["state"] in {"completed", "failed"} and current["response_body"]:
                return current["response_body"]
            self.finish_in(db, run["id"], response)
            self.audit(db, run["principal_id"], f"agent.run.{response['status']}", run["id"])
        return response

    def history(self, run):
        with self.database.connect() as db:
            rows = db.execute(
                """SELECT user_message,response_body FROM agent_runs
                WHERE principal_id=%s AND conversation_id=%s AND id!=%s
                AND response_body IS NOT NULL
                ORDER BY created_at DESC,id DESC LIMIT 4""",
                (run["principal_id"], run["conversation_id"], run["id"]),
            ).fetchall()
        messages = []
        for row in reversed(rows):
            messages += [
                {"role": "user", "content": row["user_message"]},
                {
                    "role": "assistant",
                    "content": json.dumps({"message": row["response_body"]["message"][:4000]}),
                },
            ]
        return messages

    def dispatch(self, run, call):
        spec = t.TOOLS.get(call.function.name)
        raw_hash = hashlib.sha256(call.function.arguments.encode()).hexdigest()
        body, error = None, None
        try:
            if spec is None:
                raise Problem(
                    422,
                    "TOOL_NOT_ALLOWED",
                    "The model requested an unsupported tool; nothing was executed.",
                )
            t.authorize(run["principal_id"], spec.permission)
            body = spec.input_type.model_validate_json(call.function.arguments, strict=True)
            raw_hash = fingerprint(body.model_dump(mode="json"))
        except ValidationError as exc:
            fields = sorted(
                {
                    str(item["loc"][0])
                    for item in exc.errors()
                    if item["loc"] and item["loc"][0] in spec.input_type.model_fields
                }
            )
            logger.warning(
                json.dumps(
                    {
                        "event": "tool_arguments_rejected",
                        "tool": spec.name,
                        "fields": fields,
                        "rules": sorted({item["type"] for item in exc.errors()}),
                    }
                )
            )
            error = error_detail(
                "INVALID_TOOL_ARGUMENTS", "Tool arguments do not match the registered schema."
            )
            error.fields = fields
        except Problem as exc:
            error = error_detail(exc.code, exc.message, exc.retryable)
        with self.database.connect() as db:
            current = db.execute(
                "SELECT * FROM agent_runs WHERE id=%s AND principal_id=%s FOR UPDATE",
                (run["id"], run["principal_id"]),
            ).fetchone()
            if current["state"] != "running" or current["deadline_at"] <= datetime.now(
                timezone.utc
            ):
                raise Problem(
                    409, "AGENT_DEADLINE", "The run has ended. No further tools were executed."
                )
            old = db.execute(
                "SELECT * FROM agent_actions WHERE run_id=%s AND tool_call_id=%s",
                (run["id"], call.id),
            ).fetchone()
            if old:
                if old["input_sha256"] != raw_hash or old["tool_name"] != call.function.name:
                    raise Problem(
                        409,
                        "DUPLICATE_TOOL_CALL",
                        "A tool call ID was reused with different arguments.",
                    )
                return old["result"]
            action_id = uuid4()
            # Persist validated arguments only; invalid payloads may contain secrets.
            arguments = body.model_dump(mode="json") if body is not None else {}
            db.execute(
                """INSERT INTO agent_actions
                (id,run_id,tool_call_id,tool_name,arguments,state,input_sha256)
                VALUES (%s,%s,%s,%s,%s,'proposed',%s)""",
                (action_id, run["id"], call.id, call.function.name, Jsonb(arguments), raw_hash),
            )
            self.audit(db, run["principal_id"], "agent.action.proposed", action_id)
            result = failed(call, error) if error else None
            if not error:
                try:
                    with db.transaction():
                        output = spec.handler(
                            t.ToolContext(
                                db, run["principal_id"], run["user_message"], self.settings
                            ),
                            body,
                        )
                        result = self._output(db, run, call, action_id, output)
                except Exception as exc:
                    if isinstance(exc, Problem):
                        error = error_detail(exc.code, exc.message, exc.retryable)
                    else:
                        error = error_detail(
                            "INVALID_TOOL_ARGUMENTS"
                            if isinstance(exc, ValidationError)
                            else "TOOL_FAILED",
                            "The application tool could not complete the request.",
                            isinstance(exc, psycopg.Error),
                        )
                    result = failed(call, error)
                    if isinstance(exc, t.ResolutionProblem):
                        result["data"]["candidates"] = exc.candidates
            db.execute(
                "UPDATE agent_actions SET state=%s,result=%s WHERE id=%s",
                (result["action"]["status"], Jsonb(result), action_id),
            )
            self.audit(
                db, run["principal_id"], "agent.action." + result["action"]["status"], action_id
            )
            return result

    def _output(self, db, run, call, action_id, output):
        if output.layout is not None:
            confirmation = c.Confirmation(
                id=uuid4(),
                summary=f"Save {output.layout.columns} columns, {len(output.cameras)} cameras: "
                + ", ".join(camera.name for camera in output.cameras),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=2),
            )
            proposal = a.LayoutProposal(
                confirmation=confirmation, layout=output.layout, cameras=output.cameras
            )
            arguments = output.layout.model_dump(mode="json")
            context = {
                "cameras": [t.snapshot(camera) for camera in output.cameras],
                "proposal": proposal.model_dump(mode="json"),
            }
            db.execute(
                "UPDATE agent_actions SET arguments=%s,approval_context=%s WHERE id=%s",
                (Jsonb(arguments), Jsonb(context), action_id),
            )
            db.execute(
                (
                    "INSERT INTO "
                    "confirmations(id,action_id,principal_id,arguments_sha256,expires_at) "
                    "VALUES (%s,%s,%s,%s,%s)"
                ),
                (
                    confirmation.id,
                    action_id,
                    run["principal_id"],
                    fingerprint({"arguments": arguments, "context": context}),
                    confirmation.expires_at,
                ),
            )
            db.execute(
                "UPDATE agent_runs SET state='awaiting_confirmation' WHERE id=%s", (run["id"],)
            )
            action = c.ActionNeedsConfirmation(
                tool_call_id=call.id, tool_name=call.function.name, confirmation=confirmation
            )
            return {
                "action": action.model_dump(mode="json"),
                "data": {},
                "navigation": [],
                "proposal": proposal.model_dump(mode="json"),
            }
        navigation = [nav.model_dump(mode="json") for nav in output.navigation]
        action = a.RuntimeActionSucceeded(
            tool_call_id=call.id,
            tool_name=call.function.name,
            message=output.message,
            resource_id=output.resource_id,
            navigation=navigation[0] if navigation else None,
        )
        return {
            "action": action.model_dump(mode="json"),
            "data": output.data,
            "navigation": navigation,
        }

    def decide(self, principal, confirmation_id, approved, key):
        operation = f"decideConfirmation:{confirmation_id}"
        try:
            _, response = self.database.mutate(
                principal,
                operation,
                key,
                {"approved": approved},
                lambda db: self._decide_in(db, principal, confirmation_id, approved),
            )
        except Problem as exc:
            with self.database.connect() as db:
                self.audit(
                    db, principal, f"agent.confirmation.rejected.{exc.code}", confirmation_id
                )
            raise
        if not any(error["code"] == "VERIFICATION_PENDING" for error in response["errors"]):
            return response
        # The write and single-use decision have committed. Re-read through a NEW connection.
        return self._verify(principal, operation, key, response)

    def _decide_in(self, db, principal, confirmation_id, approved):
        confirmation = db.execute(
            """SELECT cf.* FROM confirmations cf
            JOIN agent_actions ac ON ac.id=cf.action_id JOIN agent_runs r ON r.id=ac.run_id
            WHERE cf.id=%s AND cf.principal_id=%s AND r.principal_id=%s FOR UPDATE OF cf""",
            (confirmation_id, principal, principal),
        ).fetchone()
        if not confirmation:
            raise Problem(404, "NOT_FOUND", "This confirmation is not available.")
        if confirmation["decided_at"] is not None:
            raise Problem(409, "CONFIRMATION_USED", "This confirmation has already been decided.")
        action = db.execute(
            "SELECT * FROM agent_actions WHERE id=%s FOR UPDATE", (confirmation["action_id"],)
        ).fetchone()
        run = db.execute(
            "SELECT * FROM agent_runs WHERE id=%s FOR UPDATE", (action["run_id"],)
        ).fetchone()
        if (
            confirmation["decided_at"] is not None
            or action["state"] != "confirmation_required"
            or run["state"] != "awaiting_confirmation"
        ):
            raise Problem(409, "CONFIRMATION_USED", "This confirmation has already been decided.")
        if confirmation["expires_at"] <= datetime.now(timezone.utc):
            raise Problem(
                409, "CONFIRMATION_EXPIRED", "This confirmation expired. Request a new proposal."
            )
        error, resource_id = None, None
        if not approved:
            error = error_detail(
                "USER_DECLINED", "The proposed layout was declined. No layout was created."
            )
        else:
            try:
                with db.transaction():
                    t.authorize(principal, "layouts:write")
                    bound = {
                        "arguments": action["arguments"],
                        "context": action["approval_context"],
                    }
                    if (
                        action["tool_name"] != "layouts.create"
                        or fingerprint(bound) != confirmation["arguments_sha256"]
                    ):
                        raise Problem(
                            409,
                            "CONFIRMATION_MISMATCH",
                            "The approved action changed. Request a new proposal.",
                        )
                    layout = c.LayoutCreate.model_validate_json(
                        json.dumps(action["arguments"]), strict=True
                    )
                    current = {}
                    for cell in sorted(layout.cells, key=lambda cell: str(cell.camera_id)):
                        row = db.execute(
                            "SELECT * FROM cameras WHERE id=%s AND deleted_at IS NULL FOR SHARE",
                            (cell.camera_id,),
                        ).fetchone()
                        if not row or not row["enabled"]:
                            raise Problem(
                                409,
                                "CAMERA_STATE_CHANGED",
                                "A proposed camera is no longer available or enabled.",
                            )
                        current[str(cell.camera_id)] = t.snapshot(t.descriptor(row))
                    if current != {
                        camera["id"]: camera for camera in action["approval_context"]["cameras"]
                    }:
                        raise Problem(
                            409,
                            "CAMERA_STATE_CHANGED",
                            "Camera details changed after the proposal. Review a new proposal.",
                        )
                    _, saved, resource_id = store.save_layout(db, layout)
                    action_key = f"{run['id']}:{action['tool_call_id']}"
                    db.execute(
                        """INSERT INTO idempotency_keys
                        (principal_id,operation,key,request_sha256,response_status,response_body)
                        VALUES (%s,'agent.layouts.create',%s,%s,201,%s)""",
                        (principal, action_key, fingerprint(action["arguments"]), Jsonb(saved)),
                    )
                    self.audit(db, principal, "agent.layouts.create", resource_id)
            except Exception as exc:
                # The savepoint has rolled back even unexpected application failures.
                # Record a terminal, sanitized receipt and consume this decision once.
                error = (
                    error_detail(exc.code, exc.message, exc.retryable)
                    if isinstance(exc, Problem)
                    else error_detail(
                        "TOOL_FAILED",
                        "Layout creation failed; its transaction was rolled back.",
                        isinstance(exc, psycopg.Error),
                    )
                )
                resource_id = None
        if error:
            receipt = c.ActionFailed(
                tool_call_id=action["tool_call_id"], tool_name=action["tool_name"], error=error
            )
        else:
            receipt = c.ActionSucceeded(
                tool_call_id=action["tool_call_id"],
                tool_name="layouts.create",
                message="The layout transaction committed. Persistence verification is pending.",
                resource_id=resource_id,
            )
        envelope = {"action": receipt.model_dump(mode="json"), "data": {}, "navigation": []}
        db.execute(
            "UPDATE confirmations SET decided_at=now(),approved=%s WHERE id=%s",
            (approved, confirmation_id),
        )
        db.execute(
            "UPDATE agent_actions SET state=%s,result=%s WHERE id=%s",
            (receipt.status, Jsonb(envelope), action["id"]),
        )
        self.audit(db, principal, "agent.action." + receipt.status, action["id"])
        self.audit(
            db,
            principal,
            "agent.confirmation.approved" if approved else "agent.confirmation.declined",
            action["id"],
        )
        response = response_for(
            run,
            self.envelopes(db, run["id"]),
            None
            if error
            else error_detail(
                "VERIFICATION_PENDING",
                "The layout committed, but its persistence has not yet been verified.",
            ),
        )
        db.execute(
            "UPDATE agent_runs SET state=%s,response_body=%s WHERE id=%s",
            (response["status"], Jsonb(response), run["id"]),
        )
        return 200, response, resource_id

    def _verify(self, principal, operation, key, response):
        receipt = response["executed_operations"][0]
        verified, verification_error = None, None
        try:
            with self.database.connect() as db:
                action = db.execute(
                    "SELECT * FROM agent_actions WHERE run_id=%s AND tool_call_id=%s",
                    (response["run_id"], receipt["tool_call_id"]),
                ).fetchone()
                layout = store.get_layout(db, receipt["resource_id"])
                expected = c.LayoutCreate.model_validate(action["arguments"])
                actual = c.LayoutCreate.model_validate(
                    layout.model_dump(include=set(c.LayoutCreate.model_fields))
                )
                if expected != actual:
                    raise Problem(
                        409,
                        "VERIFICATION_FAILED",
                        "The saved layout no longer matches the approved arrangement.",
                    )
                verified = a.VerifiedResult(
                    tool_call_id=receipt["tool_call_id"], resource_id=layout.id, layout=layout
                ).model_dump(mode="json")
        except Exception:
            # A read can fail after a successful commit. Keep that committed operation
            # visible even for unexpected adapter/service errors; never imply rollback.
            verification_error = error_detail(
                "VERIFICATION_FAILED",
                (
                    "The layout transaction committed, but a new database read could not "
                    "verify the approved arrangement."
                ),
                True,
            )
        try:
            with self.database.connect() as db:
                cached = db.execute(
                    (
                        "SELECT response_body FROM idempotency_keys WHERE principal_id=%s AND "
                        "operation=%s AND key=%s FOR UPDATE"
                    ),
                    (principal, operation, key),
                ).fetchone()
                if not any(
                    error["code"] == "VERIFICATION_PENDING"
                    for error in cached["response_body"]["errors"]
                ):
                    return cached["response_body"]
                run = db.execute(
                    "SELECT * FROM agent_runs WHERE id=%s FOR UPDATE", (response["run_id"],)
                ).fetchone()
                action = db.execute(
                    "SELECT * FROM agent_actions WHERE run_id=%s AND tool_call_id=%s FOR UPDATE",
                    (run["id"], receipt["tool_call_id"]),
                ).fetchone()
                navigation = (
                    c.NavigationAction(
                        label="Open saved layout",
                        target=c.LayoutTarget(layout_id=receipt["resource_id"]),
                    )
                    if verified
                    else None
                )
                receipt["message"] = (
                    "Layout saved and verified from a new database read."
                    if verified
                    else "The layout transaction committed, but persistence verification failed."
                )
                receipt["navigation"] = navigation.model_dump(mode="json") if navigation else None
                envelope = {
                    "action": receipt,
                    "data": {},
                    "navigation": [receipt["navigation"]] if navigation else [],
                }
                db.execute(
                    "UPDATE agent_actions SET result=%s WHERE id=%s",
                    (Jsonb(envelope), action["id"]),
                )
                result = response_for(
                    run,
                    self.envelopes(db, run["id"]),
                    verification_error,
                    [verified] if verified else [],
                )
                db.execute(
                    "UPDATE agent_runs SET state=%s,response_body=%s WHERE id=%s",
                    (result["status"], Jsonb(result), run["id"]),
                )
                db.execute(
                    (
                        "UPDATE idempotency_keys SET response_body=%s WHERE principal_id=%s "
                        "AND operation=%s AND key=%s"
                    ),
                    (Jsonb(result), principal, operation, key),
                )
                self.audit(
                    db,
                    principal,
                    "agent.layout.verified" if verified else "agent.layout.verification_failed",
                    receipt["resource_id"],
                )
                return result
        except psycopg.Error:
            # Never turn an already committed layout into an apparent rollback on an outage.
            response["status"] = "failed"
            response["message"] = (
                "The layout transaction committed, but verification storage is "
                "unavailable. Retry this confirmation with the same Idempotency-Key."
            )
            response["errors"] = [
                error_detail("VERIFICATION_FAILED", response["message"], True).model_dump(
                    mode="json"
                )
            ]
            return response
