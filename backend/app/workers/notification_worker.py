"""
Runs inside the RQ worker process (`rq worker notifications`), NOT inside
the FastAPI app process -- this is what keeps a slow/flaky push gateway
from blocking API request handling.

Delivery covers both mobile (Expo Push API, which internally relays to
APNs/FCM) and web (would relay to the Web Push protocol via a service-
worker endpoint -- stubbed here behind the same interface so swapping in
a real web-push library later doesn't change the calling code).

App-state handling note: foreground/background/terminated delivery is
actually split between this backend and the client. This backend's only
job is to hand the payload to Expo/FCM/APNs reliably; what happens next is
OS-level (background/terminated -> shown in the system notification tray
by the OS itself) or client-code-level (foreground -> the app's own
`Notifications.addNotificationReceivedListener` decides whether to show
an in-app banner, since iOS/Android suppress the system tray notification
while the app is focused). The mobile app code (Phase 3) registers that
listener; nothing further is required server-side for that distinction.
"""
import httpx
from datetime import timedelta
from sqlalchemy import select
from app.database_sync import SyncSessionLocal
from app.models.notification import Notification, NotificationStatus, DeviceToken, Platform
from app.models.user import utcnow
from app.config import settings

BACKOFF_BASE_SECONDS = 30


def backoff_delay_seconds(attempts: int) -> int:
    """Exponential backoff for the Nth attempt: 30s, 60s, 120s, ...
    Pure function so the retry schedule is unit-testable without a DB."""
    return BACKOFF_BASE_SECONDS * (2 ** (attempts - 1))


def _is_deliverable(device: DeviceToken) -> bool:
    """Whether we have a working transport for this token's platform. Web
    push is a stub until WEB_PUSH_ENABLED is turned on, so web tokens are
    not deliverable by default -- attempting them would only burn the
    retry budget against a transport that can never succeed."""
    if device.platform in (Platform.IOS, Platform.ANDROID):
        return True
    return settings.WEB_PUSH_ENABLED


def deliver_notification(notification_id: int) -> None:
    with SyncSessionLocal() as db:
        notif = db.get(Notification, notification_id)
        if notif is None or notif.status != NotificationStatus.PENDING:
            return

        tokens = db.execute(
            select(DeviceToken).where(
                DeviceToken.user_id == notif.user_id, DeviceToken.is_valid == True  # noqa: E712
            )
        ).scalars().all()

        deliverable = [t for t in tokens if _is_deliverable(t)]
        if not deliverable:
            # No usable transport (no tokens, or only web tokens while web
            # push is disabled). Fail once instead of retrying NOTIFICATION_
            # MAX_ATTEMPTS times against something that can never deliver.
            notif.status = NotificationStatus.FAILED
            db.commit()
            return

        any_success = False
        for device in deliverable:
            try:
                ok, invalid = _send_to_device(device, notif)
            except Exception:
                # Last-resort guard: no matter what goes wrong talking to a
                # push gateway, a single device's failure must never abort
                # the whole job before attempts/backoff get recorded.
                ok, invalid = False, False
            if ok:
                any_success = True
            if invalid:
                device.is_valid = False

        notif.attempts += 1
        if any_success:
            notif.status = NotificationStatus.SENT
            notif.sent_at = utcnow()
        elif notif.attempts >= settings.NOTIFICATION_MAX_ATTEMPTS:
            notif.status = NotificationStatus.FAILED
        else:
            # Exponential backoff: reschedule instead of marking failed.
            # status stays PENDING so the next scheduler sweep (or another
            # enqueue) picks it back up once scheduled_at is reached.
            notif.scheduled_at = utcnow() + timedelta(seconds=backoff_delay_seconds(notif.attempts))

        db.commit()


def _send_to_device(device: DeviceToken, notif: Notification) -> tuple[bool, bool]:
    """Returns (delivered_ok, token_is_invalid)."""
    if device.platform in (Platform.IOS, Platform.ANDROID):
        return _send_expo(device.token, notif)
    return _send_web_push(device.token, notif)


def _send_expo(token: str, notif: Notification) -> tuple[bool, bool]:
    payload = {
        "to": token,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data or {},
        "priority": "high",
        "channelId": "default",
    }
    try:
        resp = httpx.post(settings.EXPO_PUSH_URL, json=payload, timeout=10.0)
        result = resp.json().get("data", {})
        status = result.get("status")
        if status == "ok":
            return True, False
        error_type = result.get("details", {}).get("error")
        invalid = error_type == "DeviceNotRegistered"
        return False, invalid
    except (httpx.HTTPError, ValueError):
        # ValueError covers resp.json() failing on a non-JSON response
        # (malformed gateway reply, proxy error page, etc.) -- any failure
        # here must fall through as a soft delivery failure so the caller's
        # retry/backoff logic kicks in, never as an unhandled exception
        # that would crash the worker process and leave attempts uncounted.
        return False, False


def _send_web_push(token: str, notif: Notification) -> tuple[bool, bool]:
    """Placeholder for Web Push (VAPID) delivery -- same retry/invalid-token
    contract as Expo so the orchestration logic above doesn't care which
    transport was used. Wire up `pywebpush` here for production web push."""
    return False, False
