from fastapi import APIRouter
from fastapi.testclient import TestClient
from app.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from app.main import app

error_router = APIRouter(prefix="/api/v1/test-errors")


@error_router.get("/unauthorized")
def trigger_unauthorized():
    raise UnauthorizedError("Missing or invalid token", details={"header": "missing"})


@error_router.get("/not-found")
def trigger_not_found():
    raise NotFoundError("Case not found", details={"case_no": "TEST-01"})


@error_router.get("/forbidden")
def trigger_forbidden():
    raise ForbiddenError("Cannot edit another Bureau's case")


@error_router.get("/conflict")
def trigger_conflict():
    raise ConflictError("Case number already exists")


@error_router.get("/validation")
def trigger_validation():
    raise ValidationError("Invalid input data", details={"field": "category"})


app.include_router(error_router)
client = TestClient(app)


def test_not_found_error_format():
    response = client.get("/api/v1/test-errors/not-found")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert data["error"]["message"] == "Case not found"
    assert data["error"]["details"] == {"case_no": "TEST-01"}


def test_forbidden_error_format():
    response = client.get("/api/v1/test-errors/forbidden")
    assert response.status_code == 403
    data = response.json()
    assert data["error"]["code"] == "FORBIDDEN"
    assert data["error"]["message"] == "Cannot edit another Bureau's case"


def test_conflict_error_format():
    response = client.get("/api/v1/test-errors/conflict")
    assert response.status_code == 409
    data = response.json()
    assert data["error"]["code"] == "CONFLICT"
    assert data["error"]["message"] == "Case number already exists"


def test_validation_error_format():
    response = client.get("/api/v1/test-errors/validation")
    assert response.status_code == 422
    data = response.json()
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert data["error"]["message"] == "Invalid input data"
    assert data["error"]["details"] == {"field": "category"}


def test_standard_404_format():
    response = client.get("/api/v1/non-existent-route")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"


def test_unauthorized_error_format():
    """Verify HTTP 401 response matches PRD Section 10 standard error structure."""
    response = client.get("/api/v1/test-errors/unauthorized")
    assert response.status_code == 401
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert data["error"]["message"] == "Missing or invalid token"
    assert data["error"]["details"] == {"header": "missing"}
