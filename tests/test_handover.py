import io
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from app.models.handover_note import HandoverNote
from app.models.shift import Shift

from .conftest import auth_headers_for, make_worker


def _mock_summary(urgency="low"):
    return {
        "resident_name": "Jane Doe",
        "summary": "Routine handover, resident in good spirits.",
        "key_events": [],
        "medications_given": [],
        "incidents": [],
        "follow_up_actions": [],
        "mood_notes": "Calm and cheerful",
        "urgency_flag": urgency,
    }


def _fake_audio_file(filename="test.wav", content_type="audio/wav", body=b"fake audio bytes"):
    return {"audio": (filename, io.BytesIO(body), content_type)}


# ---------------------------------------------------------------------------
# POST /handover/transcribe — happy paths
# ---------------------------------------------------------------------------

def test_transcribe_creates_handover_note(client, worker_auth_headers, test_shift, test_resident):
    with patch(
        "app.routers.handover.transcribe_audio", return_value="Patient ate lunch, no concerns."
    ) as mock_transcribe, patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("low")
    ) as mock_summarize, patch(
        "app.routers.handover.send_urgent_handover_email"
    ) as mock_email:
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 202
    note_id = response.json()["id"]
    assert response.json()["status"] in ("pending", "processing", "complete")

    mock_transcribe.assert_called_once()
    mock_summarize.assert_called_once()
    mock_email.assert_not_called()

    # background task has already completed synchronously under TestClient
    detail = client.get(f"/handover/{note_id}", headers=worker_auth_headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "complete"
    assert body["urgency_flag"] == "low"
    assert body["raw_transcript"] == "Patient ate lunch, no concerns."
    assert body["summary_json"]["resident_name"] == "Jane Doe"


def test_transcribe_accepts_various_audio_content_types(client, worker_auth_headers, test_shift, test_resident):
    for content_type in ("audio/mpeg", "audio/m4a", "audio/ogg", "audio/webm"):
        with patch("app.routers.handover.transcribe_audio", return_value="ok"), patch(
            "app.routers.handover.summarize_transcript", return_value=_mock_summary("low")
        ):
            response = client.post(
                "/handover/transcribe",
                data={"shift_id": test_shift.id, "resident_id": test_resident.id},
                files=_fake_audio_file(filename="clip.ogg", content_type=content_type),
                headers=worker_auth_headers,
            )
        assert response.status_code == 202, content_type


# ---------------------------------------------------------------------------
# POST /handover/transcribe — auth & permission checks
# ---------------------------------------------------------------------------

def test_transcribe_requires_auth(client, test_shift, test_resident):
    response = client.post(
        "/handover/transcribe",
        data={"shift_id": test_shift.id, "resident_id": test_resident.id},
        files=_fake_audio_file(),
    )

    assert response.status_code == 401


def test_transcribe_as_manager_forbidden(client, manager_auth_headers, test_shift, test_resident):
    response = client.post(
        "/handover/transcribe",
        data={"shift_id": test_shift.id, "resident_id": test_resident.id},
        files=_fake_audio_file(),
        headers=manager_auth_headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Managers are not allowed to submit shift handovers."


def test_transcribe_nonexistent_shift_returns_404(client, worker_auth_headers, test_resident):
    with patch("app.routers.handover.transcribe_audio"), patch(
        "app.routers.handover.summarize_transcript"
    ):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": 99999, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Shift with id 99999 not found"


def test_transcribe_shift_not_owned_by_user_forbidden(client, db_session, test_resident, test_user):
    shift = Shift(worker_id=test_user.id, start_time=datetime.now(timezone.utc))
    db_session.add(shift)
    db_session.commit()
    db_session.refresh(shift)

    intruder = make_worker(db_session, "intruder@test.com")
    headers = auth_headers_for(intruder)

    with patch("app.routers.handover.transcribe_audio"), patch(
        "app.routers.handover.summarize_transcript"
    ):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=headers,
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "This shift does not belong to you"


def test_transcribe_nonexistent_resident_returns_404(client, worker_auth_headers, test_shift):
    with patch("app.routers.handover.transcribe_audio"), patch(
        "app.routers.handover.summarize_transcript"
    ):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": 99999},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Resident with id 99999 not found"


def test_transcribe_missing_shift_id_field_rejected(client, worker_auth_headers, test_resident):
    response = client.post(
        "/handover/transcribe",
        data={"resident_id": test_resident.id},
        files=_fake_audio_file(),
        headers=worker_auth_headers,
    )
    assert response.status_code == 422


def test_transcribe_missing_audio_file_rejected(client, worker_auth_headers, test_shift, test_resident):
    response = client.post(
        "/handover/transcribe",
        data={"shift_id": test_shift.id, "resident_id": test_resident.id},
        headers=worker_auth_headers,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /handover/transcribe — file validation
# ---------------------------------------------------------------------------

def test_transcribe_rejects_unsupported_content_type(client, worker_auth_headers, test_shift, test_resident):
    response = client.post(
        "/handover/transcribe",
        data={"shift_id": test_shift.id, "resident_id": test_resident.id},
        files=_fake_audio_file(filename="malware.exe", content_type="application/x-msdownload"),
        headers=worker_auth_headers,
    )

    assert response.status_code == 415
    assert "Unsupported audio content type" in response.json()["detail"]


def test_transcribe_rejects_file_over_size_limit(client, worker_auth_headers, test_shift, test_resident):
    big_body = b"a" * (25 * 1024 * 1024 + 1)
    with patch("app.routers.handover.transcribe_audio"), patch(
        "app.routers.handover.summarize_transcript"
    ):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(body=big_body),
            headers=worker_auth_headers,
        )

    assert response.status_code == 413
    assert "25 MB" in response.json()["detail"]


def test_transcribe_file_exactly_at_size_limit_accepted(client, worker_auth_headers, test_shift, test_resident):
    exact_body = b"a" * (25 * 1024 * 1024)
    with patch("app.routers.handover.transcribe_audio", return_value="ok"), patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("low")
    ):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(body=exact_body),
            headers=worker_auth_headers,
        )

    assert response.status_code == 202


def test_transcribe_unrecognized_suffix_falls_back_to_wav(client, worker_auth_headers, test_shift, test_resident):
    """An allowed content type with an unrecognized/absent filename suffix
    should still be accepted (defaults internally to .wav)."""
    with patch("app.routers.handover.transcribe_audio", return_value="ok") as mock_transcribe, patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("low")
    ):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(filename="blob", content_type="application/octet-stream"),
            headers=worker_auth_headers,
        )

    assert response.status_code == 202
    mock_transcribe.assert_called_once()


# ---------------------------------------------------------------------------
# Background processing failure paths
# ---------------------------------------------------------------------------

def test_transcribe_transcription_failure_marks_note_failed(client, worker_auth_headers, test_shift, test_resident):
    with patch(
        "app.routers.handover.transcribe_audio", side_effect=Exception("Whisper exploded")
    ), patch("app.routers.handover.summarize_transcript") as mock_summarize:
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 202
    note_id = response.json()["id"]
    mock_summarize.assert_not_called()

    detail = client.get(f"/handover/{note_id}", headers=worker_auth_headers)
    body = detail.json()
    assert body["status"] == "failed"
    assert body["error_message"] == "Audio transcription failed"


def test_transcribe_summarizer_failure_marks_note_failed(client, worker_auth_headers, test_shift, test_resident):
    with patch("app.routers.handover.transcribe_audio", return_value="Some transcript"), patch(
        "app.routers.handover.summarize_transcript", side_effect=Exception("Gemini exploded")
    ):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    # request is accepted; the failure happens in the background task
    assert response.status_code == 202
    note_id = response.json()["id"]

    detail = client.get(f"/handover/{note_id}", headers=worker_auth_headers)
    body = detail.json()
    assert body["status"] == "failed"
    assert body["error_message"] == "Structured summary generation failed"
    # transcript should still be preserved even though summarization failed
    assert body["raw_transcript"] == "Some transcript"


# ---------------------------------------------------------------------------
# Urgency-triggered notifications & email
# ---------------------------------------------------------------------------

def test_transcribe_high_urgency_emails_managers(client, worker_auth_headers, test_shift, test_resident, test_manager):
    with patch(
        "app.routers.handover.transcribe_audio", return_value="Resident fell, needs review."
    ), patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("high")
    ), patch("app.routers.handover.send_urgent_handover_email") as mock_email:
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 202
    note_id = response.json()["id"]

    detail = client.get(f"/handover/{note_id}", headers=worker_auth_headers)
    assert detail.json()["urgency_flag"] == "high"
    assert detail.json()["status"] == "complete"

    mock_email.assert_called_once()
    call_kwargs = mock_email.call_args.kwargs
    assert call_kwargs["to_email"] == test_manager.email
    assert call_kwargs["resident_name"] == test_resident.name


def test_transcribe_urgent_flag_also_triggers_email(client, worker_auth_headers, test_shift, test_resident, test_manager):
    with patch(
        "app.routers.handover.transcribe_audio", return_value="Medication error occurred."
    ), patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("urgent")
    ), patch("app.routers.handover.send_urgent_handover_email") as mock_email:
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 202
    mock_email.assert_called_once()


def test_transcribe_low_urgency_does_not_notify_or_email(client, worker_auth_headers, test_shift, test_resident, db_session):
    from app.models.notification import Notification

    with patch("app.routers.handover.transcribe_audio", return_value="All good"), patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("low")
    ), patch("app.routers.handover.send_urgent_handover_email") as mock_email:
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 202
    mock_email.assert_not_called()
    assert db_session.query(Notification).count() == 0


def test_transcribe_high_urgency_emails_all_managers(client, worker_auth_headers, test_shift, test_resident, test_manager, db_session):
    from app.models.user import User
    from app.cores.security import hash_password

    second_manager = User(
        email="manager2@test.com",
        username="manager2",
        password=hash_password("password123"),
        role="manager",
    )
    db_session.add(second_manager)
    db_session.commit()

    with patch(
        "app.routers.handover.transcribe_audio", return_value="Resident fell."
    ), patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("high")
    ), patch("app.routers.handover.send_urgent_handover_email") as mock_email:
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 202
    assert mock_email.call_count == 2
    recipients = {call.kwargs["to_email"] for call in mock_email.call_args_list}
    assert recipients == {test_manager.email, second_manager.email}


def test_transcribe_high_urgency_email_failure_does_not_break_request(
    client, worker_auth_headers, test_shift, test_resident, test_manager
):
    with patch(
        "app.routers.handover.transcribe_audio", return_value="Resident fell, needs review."
    ), patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("high")
    ), patch("app.routers.handover.send_urgent_handover_email", side_effect=Exception("Resend down")):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    # email failure must not fail the request or corrupt the note's status
    assert response.status_code == 202
    note_id = response.json()["id"]

    detail = client.get(f"/handover/{note_id}", headers=worker_auth_headers)
    assert detail.json()["status"] == "complete"


def test_transcribe_high_urgency_creates_db_notification(
    client, worker_auth_headers, test_shift, test_resident, test_manager, db_session
):
    from app.models.notification import Notification

    with patch(
        "app.routers.handover.transcribe_audio", return_value="Resident fell."
    ), patch(
        "app.routers.handover.summarize_transcript", return_value=_mock_summary("high")
    ), patch("app.routers.handover.send_urgent_handover_email"):
        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    note_id = response.json()["id"]
    notification = (
        db_session.query(Notification).filter(Notification.handover_note_id == note_id).first()
    )
    assert notification is not None
    assert notification.urgency_flag == "high"
    assert notification.resident_id == test_resident.id


# ---------------------------------------------------------------------------
# GET /handover/  (list + filters)
# ---------------------------------------------------------------------------

def test_list_handover_notes(client, worker_auth_headers, test_shift, test_resident, db_session):
    note = HandoverNote(
        shift_id=test_shift.id,
        resident_id=test_resident.id,
        raw_transcript="Test transcript",
        summary_json=_mock_summary("low"),
        urgency_flag="low",
    )
    db_session.add(note)
    db_session.commit()

    response = client.get("/handover/", headers=worker_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 1


def test_list_handover_notes_requires_auth(client):
    response = client.get("/handover/")
    assert response.status_code == 401


def test_list_handover_notes_filter_by_urgency(client, worker_auth_headers, test_shift, test_resident, db_session):
    low_note = HandoverNote(
        shift_id=test_shift.id, resident_id=test_resident.id,
        raw_transcript="Low urgency note", summary_json=_mock_summary("low"), urgency_flag="low",
    )
    high_note = HandoverNote(
        shift_id=test_shift.id, resident_id=test_resident.id,
        raw_transcript="High urgency note", summary_json=_mock_summary("high"), urgency_flag="high",
    )
    db_session.add_all([low_note, high_note])
    db_session.commit()

    response = client.get("/handover/?urgency_flag=high", headers=worker_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert all(n["urgency_flag"] == "high" for n in body)
    assert any(n["raw_transcript"] == "High urgency note" for n in body)


def test_list_handover_notes_filter_by_resident_id(client, worker_auth_headers, test_shift, db_session):
    from app.models.resident import Resident

    resident_a = Resident(name="Resident A")
    resident_b = Resident(name="Resident B")
    db_session.add_all([resident_a, resident_b])
    db_session.commit()

    note_a = HandoverNote(shift_id=test_shift.id, resident_id=resident_a.id, status="complete")
    note_b = HandoverNote(shift_id=test_shift.id, resident_id=resident_b.id, status="complete")
    db_session.add_all([note_a, note_b])
    db_session.commit()

    response = client.get(f"/handover/?resident_id={resident_a.id}", headers=worker_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert all(n["resident_id"] == resident_a.id for n in body)


def test_list_handover_notes_filter_by_date_range(client, worker_auth_headers, test_shift, test_resident, db_session):
    note = HandoverNote(
        shift_id=test_shift.id, resident_id=test_resident.id, status="complete",
    )
    db_session.add(note)
    db_session.commit()

    today = date.today()
    tomorrow = today + timedelta(days=1)
    yesterday = today - timedelta(days=1)

    in_range = client.get(
        f"/handover/?date_from={yesterday.isoformat()}&date_to={tomorrow.isoformat()}",
        headers=worker_auth_headers,
    )
    assert in_range.status_code == 200
    assert any(n["id"] == note.id for n in in_range.json())

    out_of_range = client.get(
        f"/handover/?date_from={tomorrow.isoformat()}",
        headers=worker_auth_headers,
    )
    assert out_of_range.status_code == 200
    assert not any(n["id"] == note.id for n in out_of_range.json())


def test_list_handover_notes_pagination(client, worker_auth_headers, test_shift, test_resident, db_session):
    for _ in range(5):
        db_session.add(HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="complete"))
    db_session.commit()

    response = client.get("/handover/?skip=0&limit=2", headers=worker_auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_handover_notes_limit_over_max_rejected(client, worker_auth_headers):
    response = client.get("/handover/?limit=500", headers=worker_auth_headers)
    assert response.status_code == 422


def test_list_handover_notes_invalid_date_format_rejected(client, worker_auth_headers):
    response = client.get("/handover/?date_from=not-a-date", headers=worker_auth_headers)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /handover/{id}
# ---------------------------------------------------------------------------

def test_get_handover_note_by_id(client, worker_auth_headers, test_shift, test_resident, db_session):
    note = HandoverNote(
        shift_id=test_shift.id, resident_id=test_resident.id,
        raw_transcript="Test transcript", summary_json=_mock_summary("low"), urgency_flag="low",
    )
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    response = client.get(f"/handover/{note.id}", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == note.id


def test_get_handover_note_requires_auth(client, test_shift, test_resident, db_session):
    note = HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="complete")
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    response = client.get(f"/handover/{note.id}")
    assert response.status_code == 401


def test_get_nonexistent_handover_note_returns_404(client, worker_auth_headers):
    response = client.get("/handover/99999", headers=worker_auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Handover note with id 99999 not found"


# ---------------------------------------------------------------------------
# DELETE /handover/{id}  (manager only)
# ---------------------------------------------------------------------------

def test_delete_handover_note_as_manager_success(client, manager_auth_headers, test_shift, test_resident, db_session):
    note = HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="complete")
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)
    note_id = note.id

    response = client.delete(f"/handover/{note_id}", headers=manager_auth_headers)
    assert response.status_code == 204

    check = client.get(f"/handover/{note_id}", headers=manager_auth_headers)
    assert check.status_code == 404


def test_delete_handover_note_as_worker_forbidden(client, worker_auth_headers, test_shift, test_resident, db_session):
    note = HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="complete")
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    response = client.delete(f"/handover/{note.id}", headers=worker_auth_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Only managers can delete handover notes"


def test_delete_nonexistent_handover_note_returns_404(client, manager_auth_headers):
    response = client.delete("/handover/99999", headers=manager_auth_headers)
    assert response.status_code == 404


def test_delete_handover_note_requires_auth(client, test_shift, test_resident, db_session):
    note = HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="complete")
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    response = client.delete(f"/handover/{note.id}")
    assert response.status_code == 401