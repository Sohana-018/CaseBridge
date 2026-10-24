"""Overlap queue endpoints (PRD Section 10, FR8-FR11)."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.db import get_session
from app.errors import NotFoundError
from app.models import ConfidenceBand, OverlapLink, ReviewStatus
from app.permissions import (
    UserPayload,
    check_overlap_review_permission,
    check_overlap_scan_permission,
)
from app.routers.auth import get_current_user
from app.schemas import (
    OverlapListResponse,
    OverlapRead,
    OverlapReviewRequest,
    OverlapScanResponse,
)
from app.services.overlap import detect_overlaps, get_overlap_read, review_overlap

router = APIRouter(prefix="/overlaps", tags=["Overlaps"])

# High-confidence pairs are shown first in the review queue.
_BAND_RANK = {
    ConfidenceBand.HIGH: 0,
    ConfidenceBand.MEDIUM: 1,
    ConfidenceBand.LOW: 2,
}


@router.get(
    "",
    response_model=OverlapListResponse,
    summary="List flagged overlapping case pairs",
)
def list_overlaps(
    review_status: Optional[ReviewStatus] = Query(
        default=None, description="Filter by review status (open, related, duplicate, not_related, needs_review)"
    ),
    band: Optional[ConfidenceBand] = Query(
        default=None, description="Filter by confidence band (high, medium, low)"
    ),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Return the overlap review queue, highest confidence first.

    Any authenticated role can read the queue; only a Coordinator can decide
    on a pair (see POST /overlaps/{id}/review).
    """
    query = select(OverlapLink)
    if review_status is not None:
        query = query.where(OverlapLink.review_status == review_status)
    if band is not None:
        query = query.where(OverlapLink.confidence_band == band)

    links: List[OverlapLink] = list(session.exec(query).all())
    links.sort(
        key=lambda link: (
            _BAND_RANK.get(link.confidence_band, 99),
            -(link.created_at.timestamp() if link.created_at else 0.0),
            link.id or 0,
        )
    )

    total = len(links)
    offset = (page - 1) * page_size
    page_items = links[offset : offset + page_size]

    return OverlapListResponse(
        items=[get_overlap_read(session, link) for link in page_items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/scan",
    response_model=OverlapScanResponse,
    summary="Re-run overlap detection",
)
def scan_overlaps(
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Run the overlap engine over all cases and store newly flagged pairs.

    Existing pairs (including reviewed ones) are never overwritten, so this is
    safe to run repeatedly. Returns ``{created: n}``.
    """
    check_overlap_scan_permission(current_user)
    created = detect_overlaps(session)
    return OverlapScanResponse(created=created)


@router.get(
    "/{link_id}",
    response_model=OverlapRead,
    summary="Get one overlap pair with both cases",
)
def get_overlap(
    link_id: int,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Return one overlap pair, its reasons and its review decision."""
    link = session.get(OverlapLink, link_id)
    if not link:
        raise NotFoundError(f"Overlap link with id {link_id} not found", details={"id": link_id})
    return get_overlap_read(session, link)


@router.post(
    "/{link_id}/review",
    response_model=OverlapRead,
    summary="Record a review decision on an overlap pair",
)
def review_overlap_endpoint(
    link_id: int,
    body: OverlapReviewRequest,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Record related / duplicate / not_related / needs_review (FR10, FR11).

    A review event is appended to both cases; neither case is merged or
    closed, and both keep their own case number and history.
    """
    check_overlap_review_permission(current_user)
    link = review_overlap(
        session,
        link_id=link_id,
        decision=body.decision,
        reviewer=current_user.name,
        note=body.note,
    )
    return get_overlap_read(session, link)
