import io
from unittest.mock import patch
from app.models.handover_note import HandoverNote
from app.models.handover_note import HandoverNote
from app.models.handover_note import HandoverNote
from app.cores.security import create_access_token, hash_password
from app.models.shift import Shift
from app.models.user import User
from datetime import datetime, timezone


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


def _fake_audio_file():
    return {"audio": ("test.wav", io.BytesIO(b"fake audio bytes"), "audio/wav")}


def test_transcribe_creates_handover_note(client, worker_auth_headers, test_shift, test_resident):
    with patch("app.routers.handover.transcribe_audio", return_value="Patient ate lunch, no concerns.") as mock_transcribe, \
         patch("app.routers.handover.summarize_transcript", return_value=_mock_summary("low")) as mock_summarize, \
         patch("app.routers.handover.send_urgent_handover_email") as mock_email:

        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["urgency_flag"] == "low"
    assert body["raw_transcript"] == "Patient ate lunch, no concerns."
    assert body["summary_json"]["resident_name"] == "Jane Doe"

    mock_transcribe.assert_called_once()
    mock_summarize.assert_called_once()
    mock_email.assert_not_called()


def test_transcribe_requires_auth(client, test_shift, test_resident):
    response = client.post(
        "/handover/transcribe",
        data={"shift_id": test_shift.id, "resident_id": test_resident.id},
        files=_fake_audio_file(),
    )

    assert response.status_code == 401


def test_transcribe_nonexistent_shift_returns_404(client, worker_auth_headers, test_resident):
    with patch("app.routers.handover.transcribe_audio"), \
         patch("app.routers.handover.summarize_transcript"):

        response = client.post(
            "/handover/transcribe",
            data={"shift_id": -99999, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Shift with id -99999 not found"


def test_transcribe_shift_not_owned_by_user_forbidden(client, db_session, test_care_home, test_resident):
    
    other_worker = User(
        email="shiftowner@test.com",
        password=hash_password("password123"),
        role="care_worker",
        care_home_id=test_care_home.id,
    )
    db_session.add(other_worker)
    db_session.commit()
    db_session.refresh(other_worker)

    shift = Shift(worker_id=other_worker.id, start_time=datetime.now(timezone.utc))
    db_session.add(shift)
    db_session.commit()
    db_session.refresh(shift)

    intruder = User(
        email="intruder@test.com",
        password=hash_password("password123"),
        role="care_worker",
        care_home_id=test_care_home.id,
    )
    db_session.add(intruder)
    db_session.commit()
    db_session.refresh(intruder)

    token = create_access_token(data={"user_id": str(intruder.id)})
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.routers.handover.transcribe_audio"), \
         patch("app.routers.handover.summarize_transcript"):

        response = client.post(
            "/handover/transcribe",
            data={"shift_id": shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=headers,
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "This shift does not belong to you"


def test_transcribe_nonexistent_resident_returns_404(client, worker_auth_headers, test_shift):
    with patch("app.routers.handover.transcribe_audio"), \
         patch("app.routers.handover.summarize_transcript"):

        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": -99999},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Resident with id -99999 not found"


def test_transcribe_summarizer_failure_returns_502(client, worker_auth_headers, test_shift, test_resident):
    with patch("app.routers.handover.transcribe_audio", return_value="Some transcript"), \
         patch("app.routers.handover.summarize_transcript", side_effect=Exception("Gemini exploded")):

        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "Failed to generate structured summary from transcript"


def test_transcribe_high_urgency_emails_managers(client, worker_auth_headers, test_shift, test_resident, test_manager):
    with patch("app.routers.handover.transcribe_audio", return_value="Resident fell, needs review."), \
         patch("app.routers.handover.summarize_transcript", return_value=_mock_summary("high")), \
         patch("app.routers.handover.send_urgent_handover_email") as mock_email:

        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 201
    assert response.json()["urgency_flag"] == "high"

    mock_email.assert_called_once()
    call_kwargs = mock_email.call_args.kwargs
    assert call_kwargs["to_email"] == test_manager.email
    assert call_kwargs["resident_name"] == test_resident.name


def test_transcribe_high_urgency_email_failure_does_not_break_request(client, worker_auth_headers, test_shift, test_resident, test_manager):
    with patch("app.routers.handover.transcribe_audio", return_value="Resident fell, needs review."), \
         patch("app.routers.handover.summarize_transcript", return_value=_mock_summary("high")), \
         patch("app.routers.handover.send_urgent_handover_email", side_effect=Exception("Resend down")):

        response = client.post(
            "/handover/transcribe",
            data={"shift_id": test_shift.id, "resident_id": test_resident.id},
            files=_fake_audio_file(),
            headers=worker_auth_headers,
        )

    assert response.status_code == 201


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


def test_list_handover_notes_filter_by_urgency(client, worker_auth_headers, test_shift, test_resident, db_session):

    low_note = HandoverNote(
        shift_id=test_shift.id,
        resident_id=test_resident.id,
        raw_transcript="Low urgency note",
        summary_json=_mock_summary("low"),
        urgency_flag="low",
    )
    high_note = HandoverNote(
        shift_id=test_shift.id,
        resident_id=test_resident.id,
        raw_transcript="High urgency note",
        summary_json=_mock_summary("high"),
        urgency_flag="high",
    )
    db_session.add_all([low_note, high_note])
    db_session.commit()

    response = client.get("/handover/?urgency_flag=high", headers=worker_auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert all(n["urgency_flag"] == "high" for n in body)
    assert any(n["raw_transcript"] == "High urgency note" for n in body)


def test_get_handover_note_by_id(client, worker_auth_headers, test_shift, test_resident, db_session):

    note = HandoverNote(
        shift_id=test_shift.id,
        resident_id=test_resident.id,
        raw_transcript="Test transcript",
        summary_json=_mock_summary("low"),
        urgency_flag="low",
    )
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)
    note_id = note.id

    response = client.get(f"/handover/{note_id}", headers=worker_auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == note_id


def test_get_nonexistent_handover_note_returns_404(client, worker_auth_headers):
    response = client.get("/handover/-99999", headers=worker_auth_headers)

    assert response.status_code == 404
    assert response.json()["detail"] == "Handover note with id -99999 not found"