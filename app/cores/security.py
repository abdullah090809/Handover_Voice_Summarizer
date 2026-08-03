import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException
from app.cores.config import settings
from app.cores.database import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_access_token(token: str, credentials_exception):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")  # type: ignore
        if user_id is None:
            raise credentials_exception
        return user_id
    except JWTError:
        raise credentials_exception


# ---------------------------------------------------------------------------
# Item 28: Redis-based JWT blocklist
# When a user is deactivated, their token jti (or user_id) is added to a Redis
# blocklist so that any in-flight requests using that token are immediately
# rejected even before the token's natural expiry.
# ---------------------------------------------------------------------------
def _get_redis():
    """Lazy import to avoid circular dependency; redis_client is module-level."""
    from app.cores.redis_client import redis_client
    return redis_client


def blocklist_token(user_id: int, *, ttl_seconds: int | None = None) -> None:
    """Add a user's tokens to the Redis blocklist.

    Rather than tracking individual JTIs (which are not stored in the current
    token schema), we block by *user_id*.  Any token decoded with a matching
    user_id will be refused by get_current_user().

    ttl_seconds defaults to ACCESS_TOKEN_EXPIRE_MINUTES so the key is cleaned
    up automatically after no valid token could exist.
    """
    if ttl_seconds is None:
        ttl_seconds = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    _get_redis().setex(f"blocklist:user:{user_id}", ttl_seconds, "1")


def is_token_blocked(user_id: int | str) -> bool:
    try:
        return bool(_get_redis().get(f"blocklist:user:{user_id}"))
    except Exception:
        # If Redis is unavailable fail open (don't block legitimate users)
        return False


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id = verify_access_token(token, credentials_exception)

    # Check Redis blocklist before hitting the database
    if is_token_blocked(user_id):
        raise HTTPException(status_code=401, detail="Token has been revoked")

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise credentials_exception

    if user.role == "deactivated":
        raise HTTPException(status_code=401, detail="Account deactivated")

    return user


def require_manager(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "manager":
        raise HTTPException(
            status_code=403,
            detail="Manager role required",
        )
    return current_user


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def get_otp_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=10)
