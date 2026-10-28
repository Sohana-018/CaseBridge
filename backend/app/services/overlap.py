"""Overlap detection and review (PRD Section 9, FR8-FR12).

The engine is deliberately explainable:
- candidate pairs are same-institution, cross-bureau, non-disposed cases
  received within 365 days of each other;
- every flagged pair carries a confidence band and a list of human-readable
  reasons;
- nothing is auto-merged, auto-closed or auto-disposed. A coordinator makes
  every linking decision by hand.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from rapidfuzz import fuzz
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlmodel import Session, select

from app.errors import NotFoundError, ValidationError
from app.models import (
    Case,
    CaseEvent,
    CaseStatus,
    ConfidenceBand,
    EventType,
    Institution,
    OverlapLink,
    ReviewStatus,
    utc_now,
)
from app.services.alerts import create_overlap_alert

# Tuned thresholds (docs/eval.md).
# Tuned on the development split of data/labelled_pairs.csv (institution-level split):
# High requires shared reference OR (sim >= 0.16 AND same/related category).
# Medium requires sim >= 0.14 (category alone gives Low).
SIMILARITY_HIGH = 0.16
SIMILARITY_MEDIUM = 0.14
CANDIDATE_MAX_DAYS = 365
DATE_PROXIMITY_DAYS = 90

# Categories that describe the same underlying complaint area (demo mapping).
RELATED_CATEGORIES = (
    frozenset({"infrastructure", "approval"}),
    frozenset({"faculty", "other"}),
    frozenset({"admission", "examination"}),
    frozenset({"fee_refund", "admission"}),
)

# Only these decisions may be submitted by a reviewer. "open" means
# "not reviewed yet" and is never a valid decision.
REVIEW_DECISIONS = {
    ReviewStatus.RELATED,
    ReviewStatus.DUPLICATE,
    ReviewStatus.NOT_RELATED,
    ReviewStatus.NEEDS_REVIEW,
}

# Case-number style references, e.g. PG-2026-00104 or RB-2026-00219.
_CASE_REF_RE = re.compile(r"\b([A-Z]{2,4}-\d{4}-\d{5})\b")
# Letter style references, e.g. AICTE/RO/2026/118 (at least one slash).
_LETTER_REF_RE = re.compile(r"\b([A-Z]{2,6}(?:/[A-Z0-9]{2,12}){1,4})\b")

# Cache for the fitted TF-IDF vectorizer across descriptions.
_CACHED_VECTORIZER: Optional[TfidfVectorizer] = None
_CACHED_CORPUS_HASH: Optional[str] = None


def _compute_corpus_hash(descriptions: Sequence[str]) -> str:
    hasher = hashlib.sha256()
    for text in descriptions:
        hasher.update((text or "").strip().encode("utf-8", errors="ignore"))
        hasher.update(b"\x00")
    return hasher.hexdigest()


def invalidate_vectorizer_cache() -> None:
    """Invalidate the cached TF-IDF vectorizer."""
    global _CACHED_VECTORIZER, _CACHED_CORPUS_HASH
    _CACHED_VECTORIZER = None
    _CACHED_CORPUS_HASH = None


def get_or_fit_vectorizer(
    descriptions: Sequence[str],
    force_refit: bool = False,
) -> TfidfVectorizer:
    """Return a cached TfidfVectorizer or fit a new one if the corpus changed.

    Fixed settings: ngram_range=(1, 2), stop_words='english', min_df=1.
    Fitting unsupervised TF-IDF across the corpus (unsupervised representation)
    is standard because it uses no labels.
    """
    global _CACHED_VECTORIZER, _CACHED_CORPUS_HASH
    current_hash = _compute_corpus_hash(descriptions)
    if not force_refit and _CACHED_VECTORIZER is not None and _CACHED_CORPUS_HASH == current_hash:
        return _CACHED_VECTORIZER

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        stop_words="english",
        min_df=1,
    )
    valid_texts = [d for d in descriptions if (d or "").strip()]
    if not valid_texts:
        valid_texts = ["case complaint inquiry"]
    vectorizer.fit(valid_texts)
    _CACHED_VECTORIZER = vectorizer
    _CACHED_CORPUS_HASH = current_hash
    return vectorizer


def _enum_value(value: Any) -> str:
    """Return the string value of an enum member (or str(value))."""
    return value.value if hasattr(value, "value") else str(value)


def _norm_category(category: Any) -> str:
    return _enum_value(category).lower()


def categories_related(category_a: Any, category_b: Any) -> bool:
    """True when both cases concern the same or a related complaint area."""
    cat_a = _norm_category(category_a)
    cat_b = _norm_category(category_b)
    if cat_a == cat_b:
        return True
    return frozenset({cat_a, cat_b}) in RELATED_CATEGORIES


def category_signal(category_a: Any, category_b: Any) -> Optional[str]:
    """Return the category reason string, or None when unrelated."""
    if _norm_category(category_a) == _norm_category(category_b):
        return "same_category"
    if categories_related(category_a, category_b):
        return "related_category"
    return None


def extract_references(text: Optional[str]) -> set[str]:
    """Extract case-number and letter references from a description."""
    if not text:
        return set()
    upper = text.upper()
    return set(_CASE_REF_RE.findall(upper)) | set(_LETTER_REF_RE.findall(upper))


def check_shared_reference(text_a: Optional[str], text_b: Optional[str]) -> bool:
    """Check if two texts share an explicit case or letter reference.

    Uses exact matching on extracted reference tokens, plus RapidFuzz token matching
    for slight typo variations on reference codes.
    """
    refs_a = extract_references(text_a)
    refs_b = extract_references(text_b)
    if not refs_a or not refs_b:
        return False
    if refs_a & refs_b:
        return True
    for ra in refs_a:
        for rb in refs_b:
            if fuzz.ratio(ra, rb) >= 90:
                return True
    return False


def text_similarity(
    text_a: Optional[str],
    text_b: Optional[str],
    vectorizer: Optional[TfidfVectorizer] = None,
) -> float:
    """TF-IDF cosine similarity in [0, 1].

    Uses the fitted corpus vectorizer if provided; falls back to fitting
    on the pair if none is provided or if tokens are out-of-vocabulary.
    """
    a = (text_a or "").strip()
    b = (text_b or "").strip()
    if not a or not b:
        return 0.0
    if a.lower() == b.lower():
        return 1.0

    if vectorizer is not None:
        try:
            tfidf = vectorizer.transform([a, b])
            if tfidf[0].nnz > 0 and tfidf[1].nnz > 0:
                cos = float(cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0])
                return max(0.0, min(1.0, cos))
        except Exception:
            pass

    # Fallback: fit on the pair directly
    try:
        fallback_vec = TfidfVectorizer(ngram_range=(1, 2), stop_words="english", min_df=1)
        matrix = fallback_vec.fit_transform([a, b])
        cos = float(cosine_similarity(matrix[0:1], matrix[1:2])[0][0])
        return max(0.0, min(1.0, cos))
    except ValueError:
        return 0.0


def score_pair(
    case_a: Case,
    case_b: Case,
    vectorizer: Optional[TfidfVectorizer] = None,
    sim_high: float = SIMILARITY_HIGH,
    sim_medium: float = SIMILARITY_MEDIUM,
) -> Tuple[ConfidenceBand, List[str]]:
    """Score one candidate pair, returning (band, explainable reasons).

    Band rules:
    - High:   shared_reference OR (sim >= sim_high AND (same_category OR related_category))
    - Medium: sim >= sim_medium
    - Low:    same institution and different bureau only (category alone gives Low)
    """
    if case_a.institution_id != case_b.institution_id:
        raise ValidationError("Overlap pairs must belong to the same institution.")
    if case_a.id is not None and case_a.id == case_b.id:
        raise ValidationError("A case cannot overlap with itself.")

    reasons: List[str] = ["same_permanent_id"]

    cat_reason = category_signal(case_a.category, case_b.category)
    if cat_reason:
        reasons.append(cat_reason)

    shared = check_shared_reference(case_a.description, case_b.description)
    if shared:
        reasons.append("shared_reference")

    similarity = text_similarity(case_a.description, case_b.description, vectorizer=vectorizer)
    if similarity >= sim_medium:
        reasons.append(f"text_similarity {similarity:.2f}")

    days_apart = abs((case_a.received_date - case_b.received_date).days)
    if days_apart <= DATE_PROXIMITY_DAYS:
        reasons.append(f"date_proximity {days_apart} days")

    is_cat_related = cat_reason is not None
    if shared or (similarity >= sim_high and is_cat_related):
        band = ConfidenceBand.HIGH
    elif similarity >= sim_medium:
        band = ConfidenceBand.MEDIUM
    else:
        band = ConfidenceBand.LOW

    return band, reasons


def is_candidate_pair(case_a: Case, case_b: Case) -> bool:
    """Candidate filter per PRD Section 9.2.

    Same institution, both open (not disposed), different bureaus, and
    received within 365 days of each other.
    """
    if case_a.institution_id != case_b.institution_id:
        return False
    if case_a.status == CaseStatus.DISPOSED or case_b.status == CaseStatus.DISPOSED:
        return False
    if case_a.bureau == case_b.bureau:
        return False
    days_apart = abs((case_a.received_date - case_b.received_date).days)
    return days_apart <= CANDIDATE_MAX_DAYS


def detect_overlaps(session: Session, commit: bool = True) -> int:
    """Run overlap detection and persist new OverlapLink rows.

    Pairs that already have a link (whatever its review decision) are left
    untouched so human decisions are never overwritten by a re-scan.
    Returns the number of newly created links.
    """
    rows = session.exec(
        select(Case, Institution).join(Institution, Case.institution_id == Institution.id)
    ).all()

    by_institution: Dict[int, List[Case]] = {}
    all_cases: List[Case] = []
    for case, _inst in rows:
        by_institution.setdefault(case.institution_id, []).append(case)
        all_cases.append(case)

    # Rebuild or reuse cached vectorizer across all case descriptions in DB
    descriptions = [c.description or "" for c in all_cases]
    vectorizer = get_or_fit_vectorizer(descriptions)

    existing = {(link.case_a_id, link.case_b_id) for link in session.exec(select(OverlapLink)).all()}

    created = 0
    for cases in by_institution.values():
        ordered = sorted(cases, key=lambda c: c.id or 0)
        for i, case_a in enumerate(ordered):
            for case_b in ordered[i + 1 :]:
                if not is_candidate_pair(case_a, case_b):
                    continue

                pair = (min(case_a.id, case_b.id), max(case_a.id, case_b.id))
                if pair in existing:
                    continue

                band, reasons = score_pair(case_a, case_b, vectorizer=vectorizer)
                link = OverlapLink(
                    case_a_id=pair[0],
                    case_b_id=pair[1],
                    confidence_band=band,
                    reasons=reasons,
                    review_status=ReviewStatus.OPEN,
                )
                session.add(link)
                session.flush()  # assign link.id

                # Only actionable (medium/high) pairs raise an alert. Low-band
                # pairs stay in the queue but do not spam the alert feed.
                if band in (ConfidenceBand.HIGH, ConfidenceBand.MEDIUM):
                    create_overlap_alert(
                        session,
                        link_id=link.id,
                        case_no=case_a.case_no,
                        commit=False,
                    )

                existing.add(pair)
                created += 1

    if commit:
        session.commit()
    return created


def review_overlap(
    session: Session,
    link_id: int,
    decision: ReviewStatus,
    reviewer: str,
    note: Optional[str] = None,
) -> OverlapLink:
    """Record a human review decision on an overlap link (FR10, FR11).

    - The decision replaces ``review_status`` and stamps reviewer/time/note.
    - A review event is appended to *both* cases; case numbers and histories
      stay untouched and append-only.
    - Neither case is merged, closed or disposed.
    """
    link = session.get(OverlapLink, link_id)
    if not link:
        raise NotFoundError(f"Overlap link with id {link_id} not found", details={"id": link_id})

    if decision not in REVIEW_DECISIONS:
        raise ValidationError(
            f"Invalid review decision '{_enum_value(decision)}'. "
            f"Allowed: {', '.join(sorted(_enum_value(d) for d in REVIEW_DECISIONS))}",
            details={"decision": _enum_value(decision)},
        )

    now = utc_now()
    link.review_status = decision
    link.reviewed_by = reviewer
    link.reviewed_at = now
    link.note = note
    session.add(link)

    decision_text = _enum_value(decision)
    remarks = f"Overlap #{link.id} reviewed as {decision_text} by {reviewer}"
    if note and note.strip():
        remarks = f"{remarks}: {note.strip()}"

    for case_id in (link.case_a_id, link.case_b_id):
        case = session.get(Case, case_id)
        if not case:
            continue
        session.add(
            CaseEvent(
                case_id=case.id,
                ts=now,
                actor=reviewer,
                bureau=case.bureau,
                event_type=EventType.REVIEW,
                remarks=remarks,
            )
        )
        # Keep last_action consistent with FR4 (every action updates it).
        case.last_action = f"Overlap review: {decision_text}"
        case.last_action_date = now.date()
        session.add(case)

    session.commit()
    session.refresh(link)
    return link


def calculate_overlap_likelihood(reasons: List[str], band: str) -> int:
    """Calculate an explainable percentage score (0-100%) for how likely two complaints represent the same issue."""
    band_lower = band.lower() if isinstance(band, str) else _enum_value(band).lower()
    if band_lower == "high":
        base_score = 78
    elif band_lower == "medium":
        base_score = 56
    else:
        base_score = 32

    text_sim = 0.0
    has_shared_ref = False
    has_same_cat = False
    days_apart: Optional[int] = None

    for r in reasons:
        if r.startswith("text_similarity"):
            try:
                text_sim = float(r.split()[1])
            except (IndexError, ValueError):
                pass
        elif r == "shared_reference":
            has_shared_ref = True
        elif r == "same_category":
            has_same_cat = True
        elif r.startswith("date_proximity"):
            try:
                days_apart = int(r.split()[1])
            except (IndexError, ValueError):
                pass

    score = base_score
    if text_sim > 0:
        score += int(min(0.40, text_sim) * 35)
    if has_shared_ref:
        score += 12
    if has_same_cat:
        score += 6
    if days_apart is not None and days_apart <= 30:
        score += 5

    if band_lower == "high":
        return max(75, min(98, score))
    elif band_lower == "medium":
        return max(50, min(74, score))
    return max(20, min(49, score))


def calculate_work_score(case: Optional[Case], events: List[CaseEvent]) -> Dict[str, Any]:
    """Evaluate progress and work conducted by a bureau on a case."""
    if not case:
        return {
            "bureau": "Unknown",
            "case_no": "",
            "status": "",
            "events_count": 0,
            "has_officer": False,
            "assigned_officer": None,
            "days_active": 0,
            "work_score": 0,
            "stage_label": "Unassigned / Inactive",
            "summary": "No case record available",
        }

    # 1. Status progression weighting
    status_val = case.status.value if hasattr(case.status, "value") else str(case.status)
    if case.status == CaseStatus.DISPOSED:
        status_pts = 45
        stage_label = "Concluded & Disposed"
    elif case.status == CaseStatus.UNDER_PROCESS:
        status_pts = 35
        stage_label = "Active Procedural Investigation"
    elif case.status == CaseStatus.ESCALATED:
        status_pts = 25
        stage_label = "Priority Escalation"
    elif case.status == CaseStatus.TRANSFERRED:
        status_pts = 15
        stage_label = "Transferred / Reassigned"
    else:
        status_pts = 5
        stage_label = "Preliminary Intake / Pending Triage"

    # 2. Timeline milestone count
    events_count = len(events)
    events_pts = min(30, events_count * 6)

    # 3. Officer assignment
    has_officer = bool(case.assigned_officer and case.assigned_officer.strip())
    officer_pts = 10 if has_officer else 0

    # 4. Investigation duration (days between received and last action)
    days_active = 0
    if case.received_date and case.last_action_date:
        days_active = max(0, (case.last_action_date - case.received_date).days)
    days_pts = min(10, days_active // 3)

    # 5. Inquiry depth from event remarks
    depth_pts = 0
    keywords = ("inquiry", "inspection", "hearing", "notice", "evidence", "report", "verified", "site")
    for ev in events:
        if ev.remarks and any(k in ev.remarks.lower() for k in keywords):
            depth_pts = 10
            break

    total_score = min(100, status_pts + events_pts + officer_pts + days_pts + depth_pts)
    bureau_name = case.bureau.value if hasattr(case.bureau, "value") else str(case.bureau)

    officer_info = f"assigned to {case.assigned_officer}" if has_officer else "unassigned officer"
    summary = f"{events_count} action(s) logged · {stage_label} · {officer_info} · {days_active} active day(s)"

    return {
        "bureau": bureau_name,
        "case_no": case.case_no,
        "status": status_val,
        "events_count": events_count,
        "has_officer": has_officer,
        "assigned_officer": case.assigned_officer,
        "days_active": days_active,
        "work_score": total_score,
        "stage_label": stage_label,
        "summary": summary,
    }


def generate_bureau_recommendation(
    case_a: Optional[Case],
    events_a: List[CaseEvent],
    case_b: Optional[Case],
    events_b: List[CaseEvent],
    reasons: List[str],
) -> Dict[str, Any]:
    """Recommend which bureau should lead the complaint based on historical work investment."""
    work_a = calculate_work_score(case_a, events_a)
    work_b = calculate_work_score(case_b, events_b)

    bureau_a = work_a["bureau"]
    bureau_b = work_b["bureau"]

    score_a = work_a["work_score"]
    score_b = work_b["work_score"]

    if score_a > score_b:
        recommended = bureau_a
        delta = score_a - score_b
        confidence = min(96, max(60, 50 + int((delta / (score_a + score_b + 12)) * 85)))
        reason = (
            f"{bureau_a} has conducted significantly more procedural work "
            f"({work_a['events_count']} logged action(s), stage '{work_a['stage_label']}') "
            f"compared to {bureau_b} ({work_b['events_count']} action(s), stage '{work_b['stage_label']}'). "
            f"Consolidating lead responsibility under {bureau_a} preserves investigative progress and prevents duplication of effort."
        )
    elif score_b > score_a:
        recommended = bureau_b
        delta = score_b - score_a
        confidence = min(96, max(60, 50 + int((delta / (score_a + score_b + 12)) * 85)))
        reason = (
            f"{bureau_b} has advanced further in resolving this issue "
            f"({work_b['events_count']} logged action(s), stage '{work_b['stage_label']}') "
            f"than {bureau_a} ({work_a['events_count']} action(s), stage '{work_a['stage_label']}'). "
            f"Assigning lead responsibility to {bureau_b} capitalizes on existing investigative progress."
        )
    else:
        # Tie-breaker based on subject jurisdiction
        cat_a = (case_a.category.value if case_a and hasattr(case_a.category, "value") else "").lower()
        if "infrastructure" in cat_a or "approval" in cat_a:
            recommended = "RB" if "RB" in (bureau_a, bureau_b) else bureau_a
        elif "fee" in cat_a or "admission" in cat_a or "faculty" in cat_a:
            recommended = "PGRC" if "PGRC" in (bureau_a, bureau_b) else bureau_a
        else:
            recommended = bureau_a

        confidence = 58
        reason = (
            f"Both {bureau_a} and {bureau_b} have recorded equivalent preliminary progress "
            f"({work_a['events_count']} vs {work_b['events_count']} actions). "
            f"Recommend designating {recommended} as lead bureau based on operational jurisdiction for this issue category."
        )

    return {
        "recommended_bureau": recommended,
        "confidence_percentage": confidence,
        "recommendation_reason": reason,
        "work_summary_a": work_a,
        "work_summary_b": work_b,
    }


def get_overlap_read(session: Session, link: OverlapLink) -> Dict[str, Any]:
    """Serialise an overlap link into the PRD Section 10 overlap object with AI match and work recommendation."""
    case_a = session.get(Case, link.case_a_id)
    case_b = session.get(Case, link.case_b_id)

    events_a = list(session.exec(select(CaseEvent).where(CaseEvent.case_id == link.case_a_id).order_by(CaseEvent.ts.asc())).all()) if link.case_a_id else []
    events_b = list(session.exec(select(CaseEvent).where(CaseEvent.case_id == link.case_b_id).order_by(CaseEvent.ts.asc())).all()) if link.case_b_id else []

    reasons_list = list(link.reasons or [])
    band_val = _enum_value(link.confidence_band)
    likelihood = calculate_overlap_likelihood(reasons_list, band_val)
    recommendation = generate_bureau_recommendation(case_a, events_a, case_b, events_b, reasons_list)

    inst_id = (case_a.institution_id if case_a else None) or (case_b.institution_id if case_b else None)
    inst = session.get(Institution, inst_id) if inst_id else None
    inst_info = {
        "id": inst.id,
        "permanent_id": inst.permanent_id,
        "name": inst.name,
    } if inst else None

    def mini(case: Optional[Case]) -> Dict[str, str]:
        if not case:
            return {"case_no": "", "bureau": "", "status": ""}
        return {
            "case_no": case.case_no,
            "bureau": _enum_value(case.bureau),
            "status": _enum_value(case.status),
        }

    return {
        "id": link.id,
        "band": band_val,
        "review_status": _enum_value(link.review_status),
        "reasons": reasons_list,
        "case_a": mini(case_a),
        "case_b": mini(case_b),
        "institution": inst_info,
        "reviewed_by": link.reviewed_by,
        "reviewed_at": link.reviewed_at,
        "note": link.note,
        "likelihood_percentage": likelihood,
        "recommendation": recommendation,
    }


def open_overlaps_for_cases(session: Session, case_ids: List[int]) -> List[Dict[str, Any]]:
    """Return open overlap objects touching any of the given case ids."""
    if not case_ids:
        return []
    links = session.exec(
        select(OverlapLink).where(
            OverlapLink.review_status == ReviewStatus.OPEN,
            (OverlapLink.case_a_id.in_(case_ids)) | (OverlapLink.case_b_id.in_(case_ids)),
        )
    ).all()
    return [get_overlap_read(session, link) for link in links]


def find_manual_verification_items(session: Session) -> List[Dict[str, Any]]:
    """Scan database for cases or institutions with missing or conflicting permanent_id (Phase 11 acceptance).

    Cases and institutions with missing or conflicting IDs must be listed, never guessed.
    """
    from collections import defaultdict
    items: List[Dict[str, Any]] = []

    all_insts = session.exec(select(Institution)).all()
    inst_by_id = {inst.id: inst for inst in all_insts}

    # 1. Institutions with missing or invalid permanent_id
    missing_inst_ids = set()
    for inst in all_insts:
        pid = (inst.permanent_id or "").strip()
        if not pid or pid.upper() in ("UNKNOWN", "MISSING", "NONE", "UNRESOLVED", "TEMP"):
            missing_inst_ids.add(inst.id)
            items.append({
                "id": f"inst-{inst.id}",
                "case_no": None,
                "case_id": None,
                "institution_id": inst.id,
                "institution_name": inst.name,
                "permanent_id": inst.permanent_id,
                "issue_type": "missing_permanent_id",
                "reason": f"Institution record '{inst.name}' has missing or unresolved permanent_id ('{inst.permanent_id}')",
                "bureau": None,
                "received_date": None,
                "status": None,
            })

    # 2. Conflicting permanent_id across institutions (same normalized name, different permanent_ids)
    name_to_insts = defaultdict(list)
    for inst in all_insts:
        norm_name = inst.name.strip().lower()
        name_to_insts[norm_name].append(inst)

    conflicting_inst_ids = set()
    for norm_name, inst_group in name_to_insts.items():
        distinct_pids = {i.permanent_id for i in inst_group if i.permanent_id}
        if len(distinct_pids) > 1:
            for inst in inst_group:
                conflicting_inst_ids.add(inst.id)
                items.append({
                    "id": f"conflict-inst-{inst.id}",
                    "case_no": None,
                    "case_id": None,
                    "institution_id": inst.id,
                    "institution_name": inst.name,
                    "permanent_id": inst.permanent_id,
                    "issue_type": "conflicting_permanent_id",
                    "reason": f"Conflicting permanent IDs detected for institution '{inst.name}': {sorted(list(distinct_pids))}",
                    "bureau": None,
                    "received_date": None,
                    "status": None,
                })

    # 3. Cases associated with missing or conflicting permanent_ids, or missing institution_id
    cases = session.exec(select(Case)).all()
    for case in cases:
        bureau_str = case.bureau.value if hasattr(case.bureau, "value") else str(case.bureau)
        status_str = case.status.value if hasattr(case.status, "value") else str(case.status)
        date_str = case.received_date.isoformat() if case.received_date else None

        if not case.institution_id or case.institution_id not in inst_by_id:
            items.append({
                "id": f"case-missing-{case.id}",
                "case_no": case.case_no,
                "case_id": case.id,
                "institution_id": case.institution_id,
                "institution_name": "Unlinked / Missing Institution",
                "permanent_id": None,
                "issue_type": "missing_permanent_id",
                "reason": f"Case {case.case_no} is not linked to any valid registered institution.",
                "bureau": bureau_str,
                "received_date": date_str,
                "status": status_str,
            })
        elif case.institution_id in missing_inst_ids:
            inst = inst_by_id[case.institution_id]
            items.append({
                "id": f"case-inst-missing-{case.id}",
                "case_no": case.case_no,
                "case_id": case.id,
                "institution_id": inst.id,
                "institution_name": inst.name,
                "permanent_id": inst.permanent_id,
                "issue_type": "missing_permanent_id",
                "reason": f"Case {case.case_no} belongs to institution '{inst.name}' with missing/unresolved permanent_id.",
                "bureau": bureau_str,
                "received_date": date_str,
                "status": status_str,
            })
        elif case.institution_id in conflicting_inst_ids:
            inst = inst_by_id[case.institution_id]
            items.append({
                "id": f"case-inst-conflict-{case.id}",
                "case_no": case.case_no,
                "case_id": case.id,
                "institution_id": inst.id,
                "institution_name": inst.name,
                "permanent_id": inst.permanent_id,
                "issue_type": "conflicting_permanent_id",
                "reason": f"Case {case.case_no} belongs to institution '{inst.name}' with ambiguous/conflicting permanent IDs across records.",
                "bureau": bureau_str,
                "received_date": date_str,
                "status": status_str,
            })
        else:
            # Check case description for contradictory permanent_id mentions (e.g. text mentions another PID)
            inst = inst_by_id[case.institution_id]
            desc = case.description or ""
            if "CONFLICTING_PERMANENT_ID" in desc or "conflicting permanent id" in desc.lower():
                items.append({
                    "id": f"case-desc-conflict-{case.id}",
                    "case_no": case.case_no,
                    "case_id": case.id,
                    "institution_id": inst.id,
                    "institution_name": inst.name,
                    "permanent_id": inst.permanent_id,
                    "issue_type": "conflicting_permanent_id",
                    "reason": f"Case {case.case_no} complaint documentation specifies conflicting institution identification.",
                    "bureau": bureau_str,
                    "received_date": date_str,
                    "status": status_str,
                })

    return items

