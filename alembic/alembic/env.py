from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Issue #20 fix: wire Alembic to the app's own Base/metadata and DB URL
# (built from app.cores.config.settings) instead of a standalone,
# hand-maintained connection string in alembic.ini.
from app.cores.config import settings
from app.cores.database import Base

# Import every model module so they register on Base.metadata before
# autogenerate compares it against the live database.
from app.models import (  # noqa: F401
    care_home,
    handover_note,
    password_reset,
    pending_user,
    resident,
    shift,
    user,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

SQLALCHEMY_DATABASE_URL = (
    f"postgresql://{settings.database_username}:{settings.database_password}"
    f"@{settings.database_hostname}:{settings.database_port}/{settings.database_name}"
)
config.set_main_option("sqlalchemy.url", SQLALCHEMY_DATABASE_URL)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
