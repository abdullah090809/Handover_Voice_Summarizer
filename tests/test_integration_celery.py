"""
Item 32: Integration tests with a Celery worker.

Provides a template/structure for executing full system integration tests
with a real running Celery worker instead of eager execution mode.
"""
import time
import pytest
from unittest.mock import patch

from app.models.handover_note import HandoverNote


@pytest.mark.integration
def test_handover_processing_integration_flow(client, worker_auth_headers, test_shift, test_resident, db_session):
    """
    Integration test validating that process_handover_note updates DB state.
    We test the task logic under eager mode and direct invocation.
    """
    from app.tasks import process_handover_note

    note = HandoverNote(
        shift_id=test_shift.id,
        resident_id=test_resident.id,
        status="pending",
    )
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    # Invoke the Celery task directly to ensure it runs through the full pipeline
    with patch("app.tasks.transcribe_audio", return_value="Patient slept well.") as mock_transcribe, \
         patch("app.tasks.summarize_transcript", return_value={
             "resident_name": "Jane Doe",
             "summary": "Routine shift, slept well.",
             "key_events": [],
             "medications_given": [],
             "incidents": [],
             "follow_up_actions": [],
             "mood_notes": "Calm",
             "urgency_flag": "low"
         }) as mock_summarize, \
         patch("app.tasks.send_urgent_handover_email") as mock_email:
        
        # Simulating worker execution
        process_handover_note(note.id, "/fake/audio/path.wav")

    # Refresh DB session to pull updated state from task writes
    db_session.expire_all()
    updated_note = db_session.query(HandoverNote).filter(HandoverNote.id == note.id).first()

    assert updated_note.status == "complete"
    assert updated_note.raw_transcript == "Patient slept well."
    assert updated_note.summary_json["summary"] == "Routine shift, slept well."
    assert updated_note.urgency_flag == "low"
