from slowapi import Limiter
from slowapi.util import get_remote_address

def get_user_or_ip(request) -> str:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            from jose import jwt
            from app.cores.config import settings
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
            user_id = payload.get("user_id")
            if user_id:
                return f"user:{user_id}"
        except Exception:
            pass
    return get_remote_address(request)

limiter = Limiter(key_func=get_user_or_ip)