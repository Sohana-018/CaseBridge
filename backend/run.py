"""Convenience entrypoint for starting the CaseBridge backend server.

Limits the file watcher specifically to the `app/` directory so changes
in `.venv` or OneDrive sync events do not cause infinite reload loops.
"""

import os
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=True,
        reload_dirs=["app"],
    )
