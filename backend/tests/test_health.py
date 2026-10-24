from fastapi.testclient import TestClient

try:
    from app.main import app
except ImportError:
    from backend.app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
