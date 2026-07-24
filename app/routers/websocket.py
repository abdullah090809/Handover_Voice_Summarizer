import json
import logging
from typing import Dict
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from starlette.exceptions import HTTPException
from app.cores.database import SessionLocal
from app.cores.security import verify_access_token
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, role: str):
        await websocket.accept()
        self.active_connections[websocket] = role

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def broadcast(self, message: str):
        try:
            data = json.loads(message)
            msg_type = data.get("type")
        except Exception:
            msg_type = None

        disconnected = []
        for connection, role in list(self.active_connections.items()):
            if msg_type == "notification" and role != "manager":
                continue
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


@router.websocket("/handovers")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    db = SessionLocal()
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        user_id = verify_access_token(token, credentials_exception)
        if user_id is None:
            await websocket.close(code=4001, reason="Invalid token")
            return
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user is None or user.role == "deactivated":
            await websocket.close(code=4001, reason="Unauthorized")
            return
        user_role = user.role
    except Exception as e:
        logger.warning(f"WebSocket auth failed: {e}")
        await websocket.close(code=4001, reason="Unauthorized")
        return
    finally:
        db.close()

    await manager.connect(websocket, role=user_role)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

