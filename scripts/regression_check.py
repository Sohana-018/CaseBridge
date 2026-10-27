"""CaseBridge end-to-end regression check.

Usage (from the repo root):
    python scripts/regression_check.py            # one run on a fresh temp database
    python scripts/regression_check.py --runs 3   # three independent fresh runs

Each run: new temp DB -> seed_demo.py -> import_csv.py -> API checks.
Exit code 0 only if every check in every run passes.
"""
import argparse, os, subprocess, sys, tempfile, time, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"


def child() -> int:
    sys.path.insert(0, str(BACKEND))
    from fastapi.testclient import TestClient  # noqa: E402
    from app.main import app  # noqa: E402

    results = []

    def check(name, ok, detail=""):
        results.append((name, bool(ok), detail))

    def items(r):
        j = r.json()
        return j["items"] if isinstance(j, dict) and "items" in j else j

    with TestClient(app) as c:
        def tok(role, bureau=None):
            body = {"role": role}
            if bureau:
                body["bureau"] = bureau
            return {"Authorization": "Bearer " + c.post("/api/v1/auth/mock-login", json=body).json()["token"]}

        co, off_pg, off_rb, mg = tok("coordinator"), tok("bureau_officer", "PGRC"), tok("bureau_officer", "RB"), tok("senior_management")

        # auth
        r = c.post("/api/v1/auth/login", json={"username": "coordinator", "password": "coord123"})
        check("real login works (coordinator)", r.status_code == 200, r.status_code)
        r = c.post("/api/v1/auth/mock-login", json={"role": "administrator"})
        check("mock-login cannot mint administrator", r.status_code in (403, 422), r.status_code)
        r = c.get("/api/v1/cases")
        check("no token -> 401 standard error", r.status_code == 401 and "error" in r.json(), r.status_code)

        # totals agree everywhere
        summ = c.get("/api/v1/dashboard/summary", headers=co).json()
        lst = c.get("/api/v1/cases?page_size=1", headers=co).json()["total"]
        rep_s = c.get("/api/v1/reports/status", headers=co).json()
        rep_b = c.get("/api/v1/reports/bureau", headers=co).json()
        check("seed size >= 200 cases", summ["total"] >= 200, summ["total"])
        check("dashboard total == case list total == report totals",
              summ["total"] == lst == rep_s["total"] == rep_b["total"], f'{summ["total"]}/{lst}/{rep_s["total"]}/{rep_b["total"]}')
        parts = sum(summ[k] for k in ("pending", "under_process", "disposed", "transferred", "escalated"))
        check("status counts sum to total", parts == summ["total"], f'{parts} vs {summ["total"]}')
        od = c.get("/api/v1/cases?overdue=true&page_size=1", headers=co).json()["total"]
        check("overdue KPI == overdue filter", od == summ["overdue"], f'{od} vs {summ["overdue"]}')

        # overlap engine
        first = c.post("/api/v1/overlaps/scan", headers=co).json()
        second = c.post("/api/v1/overlaps/scan", headers=co).json()
        check("rescan creates 0 duplicates", second.get("created") == 0, f"first={first} second={second}")
        allp = items(c.get("/api/v1/overlaps?page_size=100", headers=co))
        total_pairs = c.get("/api/v1/overlaps?page_size=1", headers=co).json()["total"]
        pair = None
        for page in range(1, (total_pairs // 100) + 2):
            for it in items(c.get(f"/api/v1/overlaps?page_size=100&page={page}", headers=co)):
                if {it["case_a"]["case_no"], it["case_b"]["case_no"]} == {"PG-2026-00104", "RB-2026-00219"}:
                    pair = it
        check("demo pair PG-2026-00104 / RB-2026-00219 is High", pair is not None and pair["band"] == "high", pair and pair["band"])
        hm = sum(c.get(f"/api/v1/overlaps?band={b}&review_status=open&page_size=1", headers=co).json()["total"] for b in ("high", "medium"))
        check("open_overlaps KPI == open High + Medium", summ["open_overlaps"] == hm, f'{summ["open_overlaps"]} vs {hm}')

        # review flow
        if pair:
            r = c.post(f'/api/v1/overlaps/{pair["id"]}/review', headers=off_pg, json={"decision": "related", "note": "x"})
            check("officer cannot review overlap (403)", r.status_code == 403, r.status_code)
            r = c.post(f'/api/v1/overlaps/{pair["id"]}/review', headers=co, json={"decision": "related", "note": "Coordinate before notice"})
            check("coordinator review -> 200", r.status_code == 200, r.status_code)
            ok = True
            for cn in ("PG-2026-00104", "RB-2026-00219"):
                ev = items(c.get(f"/api/v1/cases/{cn}/events", headers=co))
                ok = ok and any(e["event_type"] == "review" for e in ev)
            check("review event appears on BOTH cases", ok)
            a = c.get("/api/v1/cases/PG-2026-00104", headers=co).json()["status"]
            b = c.get("/api/v1/cases/RB-2026-00219", headers=co).json()["status"]
            check("review does not change case statuses", (a, b) == ("under_process", "pending"), (a, b))
            after = c.get("/api/v1/dashboard/summary", headers=co).json()["open_overlaps"]
            check("open_overlaps drops by 1 after review", after == summ["open_overlaps"] - 1, f'{summ["open_overlaps"]} -> {after}')

        # workflow
        cand = items(c.get("/api/v1/cases?bureau=PGRC&status=pending&page_size=1", headers=co))
        if cand:
            cn = cand[0]["case_no"]
            r = c.post(f"/api/v1/cases/{cn}/events", headers=co, json={"event_type": "transfer", "to_bureau": "RB", "remarks": "regression transfer"})
            now = c.get(f"/api/v1/cases/{cn}", headers=co).json()
            ev = items(c.get(f"/api/v1/cases/{cn}/events", headers=co))
            check("transfer moves bureau and logs event", r.status_code == 201 and now["bureau"] == "RB" and ev[-1]["event_type"] == "transfer", r.status_code)
        r = c.delete("/api/v1/cases/PG-2026-00104/events/1", headers=co)
        check("event DELETE returns 405 (append-only)", r.status_code == 405, r.status_code)

        # search / filters
        s1 = c.get("/api/v1/cases?query=DEMO-1042&page_size=100", headers=co).json()
        check("search by Permanent ID finds cases", s1["total"] > 0, s1["total"])
        t_rb = c.get("/api/v1/cases?bureau=RB&page_size=1", headers=co).json()["total"]
        t_both = c.get("/api/v1/cases?bureau=RB&status=pending&page_size=1", headers=co).json()["total"]
        check("combined filters narrow results", 0 < t_both <= t_rb, f"{t_both} <= {t_rb}")

        # case numbers + validation + permissions
        nums = []
        for k in range(5):
            r = c.post("/api/v1/cases", headers=co, json={"permanent_id": "DEMO-1042", "bureau": "OC", "category": "other",
                                                          "description": f"regression case {k} {uuid.uuid4().hex[:6]}", "received_date": "2026-10-20"})
            nums.append(r.json().get("case_no") if r.status_code == 201 else f"ERR{r.status_code}")
        seq = [int(n.split("-")[-1]) for n in nums if not n.startswith("ERR")]
        check("5 new cases get unique consecutive numbers", len(seq) == 5 and seq == list(range(seq[0], seq[0] + 5)), nums)
        r = c.post("/api/v1/cases", headers=co, json={"permanent_id": "DEMO-1042", "bureau": "OC", "category": "other", "description": "future", "received_date": "2031-01-01"})
        check("future received_date rejected (422)", r.status_code == 422, r.status_code)
        r = c.post("/api/v1/cases", headers=mg, json={})
        check("senior management create -> 403 before validation", r.status_code == 403, r.status_code)

        # privacy: officer vs another Bureau's case
        other = c.get("/api/v1/cases/RB-2026-00219", headers=off_pg)
        check("officer sees only summary of other Bureau's case", other.status_code == 200 and "description" not in other.json() and "next_action" not in other.json(), sorted(other.json().keys()))
        r = c.get("/api/v1/cases/RB-2026-00219/events", headers=off_pg)
        leaked = r.status_code == 200 and any(e.get("remarks") for e in items(r))
        check("officer CANNOT read other Bureau's event remarks", not leaked, f"status {r.status_code}, remarks exposed={leaked}")

        # reports + admin
        for k in ("bureau", "status", "region", "institution", "ageing", "disposal", "overlap_outcomes"):
            r1, r2 = c.get(f"/api/v1/reports/{k}", headers=co), c.get(f"/api/v1/reports/{k}/csv", headers=co)
            check(f"report '{k}' JSON + CSV return 200", r1.status_code == 200 and r2.status_code == 200, f"{r1.status_code}/{r2.status_code}")
        rows = [l for l in c.get("/api/v1/reports/status/csv", headers=co).text.strip().splitlines()[1:] if l]
        csv_sum = sum(int(l.split(",")[1]) for l in rows)
        check("status CSV counts sum to report total", csv_sum == c.get("/api/v1/reports/status", headers=co).json()["total"], csv_sum)
        ad = {"Authorization": "Bearer " + c.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"}).json()["token"]}
        check("admin health-summary: admin 200, coordinator 403",
              c.get("/api/v1/admin/health-summary", headers=ad).status_code == 200 and c.get("/api/v1/admin/health-summary", headers=co).status_code == 403)

    width = max(len(n) for n, _, _ in results)
    failed = 0
    for n, ok, d in results:
        failed += 0 if ok else 1
        print(f'  [{"PASS" if ok else "FAIL"}] {n.ljust(width)}  {"" if ok else d}', flush=True)
    print(f"  -> {len(results) - failed}/{len(results)} passed", flush=True)
    return 1 if failed else 0


def parent(runs: int) -> int:
    bad = 0
    for i in range(1, runs + 1):
        db = Path(tempfile.gettempdir()) / f"casebridge_regression_{uuid.uuid4().hex[:8]}.db"
        env = dict(os.environ, DATABASE_URL=f"sqlite:///{db.as_posix()}", ALLOW_DEMO_LOGIN="true",
                   JWT_SECRET=os.environ.get("JWT_SECRET", "regression-secret-regression-secret-123"), ENV="dev",
                   PYTHONPATH=str(BACKEND), PYTHONUNBUFFERED="1")
        print(f"=== Run {i}/{runs}  (fresh DB {db.name}) ===", flush=True)
        t0 = time.time()
        for script in ("seed_demo.py", "import_csv.py"):
            p = subprocess.run([sys.executable, str(ROOT / "scripts" / script)], env=env, capture_output=True, text=True)
            if p.returncode:
                print(f"  seeding failed in {script}:\n{p.stdout[-400:]}{p.stderr[-400:]}", flush=True)
                bad += 1
                break
        else:
            p = subprocess.run([sys.executable, __file__, "--child"], env=env)
            bad += 1 if p.returncode else 0
        print(f"  ({time.time() - t0:.1f}s)", flush=True)
        try:
            db.unlink(missing_ok=True)
        except OSError:
            pass
    print(f"\nRESULT: {'ALL RUNS CLEAN' if not bad else str(bad) + ' run(s) with failures'}", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--child", action="store_true")
    a = ap.parse_args()
    sys.exit(child() if a.child else parent(a.runs))
